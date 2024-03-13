import { DebugLogger } from '@affine/debug';
import type { WorkspaceFlavour } from '@affine/env/workspace';
import type { DocCollection } from '@blocksuite/store';
import { differenceWith } from 'lodash-es';

import { createIdentifier } from '../../di';
import { LiveData } from '../../livedata';
import type { GlobalCache } from '../../storage';
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
      docCollection: DocCollection,
      blobStorage: BlobStorage
    ) => Promise<void>
  ): Promise<WorkspaceMetadata>;

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

export const WorkspaceListProvider = createIdentifier<WorkspaceListProvider>(
  'WorkspaceListProvider'
);

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
export class WorkspaceListService {
  private readonly abortController = new AbortController();

  private readonly workspaceInformationList = new Map<
    string,
    WorkspaceInformation
  >();

  status = new LiveData<WorkspaceListStatus>({
    loading: true,
    workspaceList: [],
  });

  setStatus(status: WorkspaceListStatus) {
    this.status.next(status);
    // update cache
    writeWorkspaceListCache(this.cache, status.workspaceList);
  }

  workspaceList = this.status.map(x => x.workspaceList);

  constructor(
    private readonly providers: WorkspaceListProvider[],
    private readonly cache: GlobalCache
  ) {
    // initialize workspace list from cache
    const cached = readWorkspaceListCache(cache);
    const workspaceList = cached;
    this.status.next({
      ...this.status.value,
      workspaceList,
    });

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
      docCollection: DocCollection,
      blobStorage: BlobStorage
    ) => Promise<void> = () => Promise.resolve()
  ) {
    const provider = this.providers.find(x => x.name === flavour);
    if (!provider) {
      throw new Error(`Unknown workspace flavour: ${flavour}`);
    }
    const metadata = await provider.create(initial);
    // update workspace list
    this.setStatus(this.addWorkspace(this.status.value, metadata));
    return metadata;
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
    this.setStatus(this.deleteWorkspace(this.status.value, workspaceMetadata));
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
    let status = this.status.value;

    for (const added of changed.added ?? []) {
      status = this.addWorkspace(status, added);
    }
    for (const deleted of changed.deleted ?? []) {
      status = this.deleteWorkspace(status, deleted);
    }

    this.setStatus(status);
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
        this.setStatus({
          ...this.status.value,
          loading: false,
        });
      });
  }

  async revalidate() {
    await Promise.allSettled(
      this.providers.map(async provider => {
        try {
          const list = await provider.getList();
          const oldList = this.workspaceList.value.filter(
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
    const information = new WorkspaceInformation(
      workspaceMetadata,
      provider,
      this.cache
    );
    information.fetch();
    this.workspaceInformationList.set(workspaceMetadata.id, information);
    return information;
  }

  dispose() {
    this.abortController.abort();
  }
}
