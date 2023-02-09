import * as Y from 'yjs';
import assert from 'assert';

import { LocalProvider } from '../local/index.js';
import type { IPCMethodsType } from './ipc/methods.js';
import {
  CreateWorkspaceInfoParams,
  ProviderConstructorParams,
} from '../base.js';
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import { IPCBlobProvider } from './blocksuite-provider/blob.js';
import type { WorkspaceUnit } from 'src/workspace-unit.js';
import { createWorkspaceUnit, loadWorkspaceUnit } from '../local/utils.js';
import { WorkspaceWithPermission } from './ipc/types/workspace.js';
import { applyUpdate } from '../../utils/index.js';

/**
 * init - createUser - create first workspace and ydoc - loadWorkspace - return the first workspace - wrapWorkspace - #initDocFromIPC - applyUpdate - on('update') - updateYDocument
 *
 * (init - createUser - error) loadWorkspace - return the first workspace - wrapWorkspace - #initDocFromIPC - applyUpdate - on('update') - updateYDocument
 */
export class TauriIPCProvider extends LocalProvider {
  static id = 'tauri-ipc';
  /**
   * // TODO: We only have one user in this version of app client. But may support switch user later.
   */
  #defaultUserID = 1;
  #ipc: IPCMethodsType | undefined;

  constructor(params: ProviderConstructorParams) {
    super(params);
  }

  async init(ipc?: IPCMethodsType) {
    if (ipc) {
      this.#ipc = ipc;
    } else {
      this.#ipc = await import('./ipc/methods.js');
    }
    // we create a default user if we don't have one.
    try {
      const user = await this.#ipc?.createUser({
        email: 'xxx@xx.xx',
        name: 'xxx',
        password: 'xxx',
        avatar_url: '',
      });
      this.#defaultUserID = user.id;
    } catch (error) {
      // maybe user existed, which can be omited
      console.error(error);
    }
  }

  async #initDocFromIPC(
    workspaceID: string,
    blocksuiteWorkspace: BlocksuiteWorkspace
  ) {
    this._logger(`Loading ${workspaceID}...`);
    const result = await this.#ipc?.getYDocument({ id: workspaceID });
    if (result) {
      const updates = result.updates.map(
        binaryUpdate => new Uint8Array(binaryUpdate)
      );

      const mergedUpdate = Y.mergeUpdates(updates);
      await applyUpdate(blocksuiteWorkspace, mergedUpdate);
      this._logger(`Loaded: ${workspaceID}`);
    }
  }

  async #connectDocToIPC(
    workspaceID: string,
    blocksuiteWorkspace: BlocksuiteWorkspace
  ) {
    this._logger(`Connecting yDoc for ${workspaceID}...`);
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
        console.error("#yDocument.on('update'", error);
      }
    });
  }

  async clear() {
    await super.clear();
  }

  override async warpWorkspace(blocksuiteWorkspace: BlocksuiteWorkspace) {
    const { room } = blocksuiteWorkspace;
    assert(room);

    (await blocksuiteWorkspace.blobs)?.setProvider(
      await IPCBlobProvider.init(room)
    );
    await this.#initDocFromIPC(room, blocksuiteWorkspace);
    await this.#connectDocToIPC(room, blocksuiteWorkspace);

    return blocksuiteWorkspace;
  }

  public override async createWorkspace(
    meta: CreateWorkspaceInfoParams
  ): Promise<WorkspaceUnit | undefined> {
    this._logger('Creating client app workspace');
    assert(this.#ipc);
    const { id } = await this.#ipc.createWorkspace({
      name: meta.name,
      // TODO: get userID here
      user_id: this.#defaultUserID,
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
    }
    return workspaceUnit;
  }

  override async loadWorkspaces(): Promise<WorkspaceUnit[]> {
    assert(this.#ipc);
    const { workspaces } = await this.#ipc.getWorkspaces({
      user_id: this.#defaultUserID,
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
