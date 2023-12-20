import { DebugLogger } from '@affine/debug';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import { Slot } from '@blocksuite/global/utils';
import type { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';
import { differenceWith } from 'lodash-es';

import type { BlobStorage } from '../engine';
import type { WorkspaceMetadata } from '../metadata';
import { readWorkspaceListCache, writeWorkspaceListCache } from './cache';
import { type WorkspaceInfo, WorkspaceInformation } from './information';

export * from './information';

const logger = new DebugLogger('affine:workspace:list');

export interface WorkspaceListProvider {
  name: WorkspaceFlavour;

  /**
   * get workspaces list
   */
  getList(): Promise<WorkspaceMetadata[]>;

  /**
   * delete workspace by id
   */
  delete(workspaceId: string): Promise<void>;

  /**
   * create workspace
   * @param initial callback to put initial data to workspace
   */
  create(
    initial: (
      workspace: BlockSuiteWorkspace,
      blobStorage: BlobStorage
    ) => Promise<void>
  ): Promise<string>;

  /**
   * Start subscribe workspaces list
   *
   * @returns unsubscribe function
   */
  subscribe(
    callback: (changed: {
      added?: WorkspaceMetadata[];
      deleted?: WorkspaceMetadata[];
    }) => void
  ): () => void;

  /**
   * get workspace avatar and name by id
   *
   * @param id workspace id
   */
  getInformation(id: string): Promise<WorkspaceInfo | undefined>;
}

export interface WorkspaceListStatus {
  /**
   * is workspace list doing first loading.
   * if false, UI can display workspace not found page.
   */
  loading: boolean;
  workspaceList: WorkspaceMetadata[];
}

/**
 * # WorkspaceList
 *
 * manage multiple workspace metadata list providers.
 * provide a __cache-first__ and __offline useable__ workspace list.
 */
export class WorkspaceList {
  private readonly abortController = new AbortController();

  private readonly workspaceInformationList = new Map<
    string,
    WorkspaceInformation
  >();

  onStatusChanged = new Slot<WorkspaceListStatus>();
  private _status: Readonly<WorkspaceListStatus> = {
    loading: true,
    workspaceList: [],
  };

  get status() {
    return this._status;
  }

  set status(status) {
    this._status = status;
    // update cache
    writeWorkspaceListCache(status.workspaceList);
    this.onStatusChanged.emit(this._status);
  }

  get workspaceList() {
    return this.status.workspaceList;
  }

  constructor(private readonly providers: WorkspaceListProvider[]) {
    // initialize workspace list from cache
    const cache = readWorkspaceListCache();
    const workspaceList = cache;
    this.status = {
      ...this.status,
      workspaceList,
    };

    // start first load
    this.startLoad();
  }

  /**
   * create workspace
   * @param flavour workspace flavour
   * @param initial callback to put initial data to workspace
   * @returns workspace id
   */
  async create(
    flavour: WorkspaceFlavour,
    initial: (
      workspace: BlockSuiteWorkspace,
      blobStorage: BlobStorage
    ) => Promise<void>
  ) {
    const provider = this.providers.find(x => x.name === flavour);
    if (!provider) {
      throw new Error(`Unknown workspace flavour: ${flavour}`);
    }
    const id = await provider.create(initial);
    const metadata = {
      id,
      flavour,
    };
    // update workspace list
    this.status = this.addWorkspace(this.status, metadata);
    return id;
  }

  /**
   * delete workspace
   * @param workspaceMetadata
   */
  async delete(workspaceMetadata: WorkspaceMetadata) {
    logger.info(
      `delete workspace [${workspaceMetadata.flavour}] ${workspaceMetadata.id}`
    );
    const provider = this.providers.find(
      x => x.name === workspaceMetadata.flavour
    );
    if (!provider) {
      throw new Error(
        `Unknown workspace flavour: ${workspaceMetadata.flavour}`
      );
    }
    await provider.delete(workspaceMetadata.id);

    // delete workspace from list
    this.status = this.deleteWorkspace(this.status, workspaceMetadata);
  }

  /**
   * add workspace to list
   */
  private addWorkspace(
    status: WorkspaceListStatus,
    workspaceMetadata: WorkspaceMetadata
  ) {
    if (status.workspaceList.some(x => x.id === workspaceMetadata.id)) {
      return status;
    }
    return {
      ...status,
      workspaceList: status.workspaceList.concat(workspaceMetadata),
    };
  }

  /**
   * delete workspace from list
   */
  private deleteWorkspace(
    status: WorkspaceListStatus,
    workspaceMetadata: WorkspaceMetadata
  ) {
    if (!status.workspaceList.some(x => x.id === workspaceMetadata.id)) {
      return status;
    }
    return {
      ...status,
      workspaceList: status.workspaceList.filter(
        x => x.id !== workspaceMetadata.id
      ),
    };
  }

  /**
   * callback for subscribe workspaces list
   */
  private handleWorkspaceChange(changed: {
    added?: WorkspaceMetadata[];
    deleted?: WorkspaceMetadata[];
  }) {
    let status = this.status;

    for (const added of changed.added ?? []) {
      status = this.addWorkspace(status, added);
    }
    for (const deleted of changed.deleted ?? []) {
      status = this.deleteWorkspace(status, deleted);
    }

    this.status = status;
  }

  /**
   * start first load workspace list
   */
  private startLoad() {
    for (const provider of this.providers) {
      // subscribe workspace list change
      const unsubscribe = provider.subscribe(changed => {
        this.handleWorkspaceChange(changed);
      });

      // unsubscribe when abort
      if (this.abortController.signal.aborted) {
        unsubscribe();
        return;
      }
      this.abortController.signal.addEventListener('abort', () => {
        unsubscribe();
      });
    }

    this.revalidate()
      .catch(error => {
        logger.error('load workspace list error: ' + error);
      })
      .finally(() => {
        this.status = {
          ...this.status,
          loading: false,
        };
      });
  }

  async revalidate() {
    await Promise.allSettled(
      this.providers.map(async provider => {
        try {
          const list = await provider.getList();
          const oldList = this.workspaceList.filter(
            w => w.flavour === provider.name
          );
          this.handleWorkspaceChange({
            added: differenceWith(list, oldList, (a, b) => a.id === b.id),
            deleted: differenceWith(oldList, list, (a, b) => a.id === b.id),
          });
        } catch (error) {
          logger.error('load workspace list error: ' + error);
        }
      })
    );
  }

  /**
   * get workspace information, if not exists, create it.
   */
  getInformation(meta: WorkspaceMetadata) {
    const exists = this.workspaceInformationList.get(meta.id);
    if (exists) {
      return exists;
    }

    return this.createInformation(meta);
  }

  private createInformation(workspaceMetadata: WorkspaceMetadata) {
    const provider = this.providers.find(
      x => x.name === workspaceMetadata.flavour
    );
    if (!provider) {
      throw new Error(
        `Unknown workspace flavour: ${workspaceMetadata.flavour}`
      );
    }
    const information = new WorkspaceInformation(workspaceMetadata, provider);
    information.fetch();
    this.workspaceInformationList.set(workspaceMetadata.id, information);
    return information;
  }

  dispose() {
    this.abortController.abort();
  }
}
