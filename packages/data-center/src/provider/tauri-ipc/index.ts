import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import assert from 'assert';
import * as Y from 'yjs';

import { User } from '../../types';
import { applyUpdate } from '../../utils';
import type { WorkspaceUnit } from '../../workspace-unit';
import { CreateWorkspaceInfoParams, ProviderConstructorParams } from '../base';
import { LocalProvider } from '../local';
import { loadWorkspaceUnit } from '../local/utils';
import { IPCBlobProvider } from './blocksuite-provider/blob';
import type { IPCMethodsType } from './ipc/methods';
import { WorkspaceWithPermission } from './ipc/types/workspace';
import { createWorkspaceUnit } from './utils';

/**
 * init - createUser - create first workspace and ydoc - loadWorkspace - return the first workspace - wrapWorkspace - #initDocFromIPC - applyUpdate - on('update') - updateYDocument
 *
 * (init - createUser - error) loadWorkspace - return the first workspace - wrapWorkspace - #initDocFromIPC - applyUpdate - on('update') - updateYDocument
 */
export class TauriIPCProvider extends LocalProvider {
  public id = 'tauri-ipc';
  static defaultUserEmail = 'xxx@xx.xx';

  /**
   * // TODO: We only have one user in this version of app client. But may support switch user later.
   */
  #userID?: string;
  #ipc: IPCMethodsType | undefined;

  constructor(params: ProviderConstructorParams) {
    super(params);
  }

  async init(ipc?: IPCMethodsType) {
    if (ipc) {
      this.#ipc = ipc;
    } else {
      this.#ipc = await import('./ipc/methods');
    }
    try {
      const user = await this.#ipc?.getUser({
        email: TauriIPCProvider.defaultUserEmail,
      });
      this.#userID = user.id;
    } catch (error) {
      // maybe user not existed, we create a default user if we don't have one.
      try {
        const user = await this.#ipc?.createUser({
          email: TauriIPCProvider.defaultUserEmail,
          name: 'xxx',
          password: 'xxx',
          avatar_url: '',
        });
        this.#userID = user.id;
      } catch (error) {
        // maybe user existed, which can be omited
        console.error(error);
      }
    }
  }

  /**
   * get auth user info
   * @returns
   */
  public async getUserInfo(): Promise<User | undefined> {
    const user = await this.#ipc?.getUser({
      email: TauriIPCProvider.defaultUserEmail,
    });
    if (user?.name !== undefined) {
      return {
        ...user,
        avatar: user?.avatar_url || '',
      };
    }
  }

  async #initDocFromIPC(
    workspaceID: string,
    blocksuiteWorkspace: BlocksuiteWorkspace
  ) {
    this._logger.debug(`Loading ${workspaceID}...`);
    const result = await this.#ipc?.getYDocument({ id: workspaceID });
    if (result) {
      const updates = result.updates.map(
        binaryUpdate => new Uint8Array(binaryUpdate)
      );

      const mergedUpdate = Y.mergeUpdates(updates);
      await applyUpdate(blocksuiteWorkspace, mergedUpdate);
      this._logger.debug(`Loaded: ${workspaceID}`);
    }
  }

  async #connectDocToIPC(
    workspaceID: string,
    blocksuiteWorkspace: BlocksuiteWorkspace
  ) {
    this._logger.debug(`Connecting yDoc for ${workspaceID}...`);
    blocksuiteWorkspace.doc.on('update', async (update: Uint8Array) => {
      try {
        const binary = Y.encodeStateAsUpdate(blocksuiteWorkspace.doc);
        const success = await this.#ipc?.updateYDocument({
          update: Array.from(binary),
          id: workspaceID,
        });
        if (!success) {
          throw new Error(`YDoc update failed, id: ${workspaceID}`);
        }
      } catch (error) {
        // TODO: write error log to disk, and add button to open them in settings panel
        this._logger.error("#yDocument.on('update'", error);
      }
    });
  }

  async clear() {
    await super.clear();
  }

  override async warpWorkspace(blocksuiteWorkspace: BlocksuiteWorkspace) {
    const { id } = blocksuiteWorkspace;
    assert(id);

    (await blocksuiteWorkspace.blobs)?.setProvider(
      await IPCBlobProvider.init(id)
    );
    await this.#initDocFromIPC(id, blocksuiteWorkspace);
    await this.#connectDocToIPC(id, blocksuiteWorkspace);

    return blocksuiteWorkspace;
  }

  public override async createWorkspace(
    meta: CreateWorkspaceInfoParams
  ): Promise<WorkspaceUnit | undefined> {
    this._logger.debug('Creating client app workspace');
    assert(this.#ipc);
    assert(this.#userID);
    const { id } = await this.#ipc.createWorkspace({
      name: meta.name,
      // TODO: get userID here
      user_id: this.#userID,
    });

    const workspaceUnit = await createWorkspaceUnit({
      name: meta.name,
      id,
      published: false,
      avatar: '',
      owner: undefined,
      syncMode: 'core',
      memberCount: 1,
      provider: this.id,
    });
    this._workspaces.add(workspaceUnit);
    const doc = workspaceUnit?.blocksuiteWorkspace?.doc;
    if (doc) {
      const update = Y.encodeStateAsUpdate(doc);
      const success = await this.#ipc?.updateYDocument({
        update: Array.from(update),
        id,
      });
      if (!success) {
        throw new Error(`YDoc update failed, id: ${id}`);
      }
    }
    return workspaceUnit;
  }

  override async loadWorkspaces(): Promise<WorkspaceUnit[]> {
    assert(this.#ipc);
    assert(this.#userID);
    const { workspaces } = await this.#ipc.getWorkspaces({
      user_id: this.#userID,
    });
    const workspaceUnits = await Promise.all(
      workspaces.map((meta: WorkspaceWithPermission) => {
        return loadWorkspaceUnit({
          ...meta,
          memberCount: 1,
          // TODO: load name here
          name: '',
          provider: this.id,
          syncMode: 'all',
        });
      })
    );
    this._workspaces.add(workspaceUnits);
    return workspaceUnits;
  }
}
