import * as Y from 'yjs';
import assert from 'assert';

import { LocalProvider } from '../local/index.js';
import * as ipcMethods from './ipc/methods.js';
import {
  CreateWorkspaceInfoParams,
  ProviderConstructorParams,
} from '../base.js';
import { Workspace as BlocksuiteWorkspace } from '@blocksuite/store';
import { IPCBlobProvider } from './blocksuite-provider/blob.js';
import { WorkspaceUnit } from 'src/workspace-unit.js';
import { createWorkspaceUnit, loadWorkspaceUnit } from '../local/utils.js';
import { WorkspaceWithPermission } from './ipc/types/workspace.js';

export class TauriIPCProvider extends LocalProvider {
  static id = 'tauri-ipc';
  /**
   * // TODO: We only have one user in this version of app client. But may support switch user later.
   */
  #defaultUserID = 1;

  constructor(params: ProviderConstructorParams) {
    super(params);
  }

  async init() {
    // we create a default user if we don't have one.
    try {
      const user = await ipcMethods.createUser({
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

  async #initDocFromIPC(workspaceID: string, doc: Y.Doc) {
    this._logger(`Loading ${workspaceID}...`);
    const result = await ipcMethods.getYDocument({ id: workspaceID });
    if (result) {
      await new Promise(resolve => {
        doc.once('update', resolve);
        const updates = result.updates.map(
          binaryUpdate => new Uint8Array(binaryUpdate)
        );
        const mergedUpdate = Y.mergeUpdates(updates);
        // DEBUG: console mergedUpdate
        console.log(`mergedUpdate`, mergedUpdate);
        Y.applyUpdate(doc, new Uint8Array(mergedUpdate));
      });
      this._logger(`Loaded: ${workspaceID}`);
    }
  }

  async #connectDocToIPC(workspaceID: string, doc: Y.Doc) {
    this._logger(`Connecting yDoc for ${workspaceID}...`);
    doc.on('update', async (update: Uint8Array) => {
      try {
        // TODO: need handle potential data race when update is frequent?
        // TODO: update seems too frequent upon each keydown, why no batching?
        const success = await ipcMethods.updateYDocument({
          update: Array.from(update),
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
    const { doc, room } = blocksuiteWorkspace;
    assert(room);

    (await blocksuiteWorkspace.blobs)?.addProvider(new IPCBlobProvider());
    await this.#initDocFromIPC(room, doc);
    await this.#connectDocToIPC(room, doc);

    return blocksuiteWorkspace;
  }

  public override async createWorkspace(
    meta: CreateWorkspaceInfoParams
  ): Promise<WorkspaceUnit | undefined> {
    this._logger('Creating client app workspace');

    const { id } = await ipcMethods.createWorkspace({
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
    return workspaceUnit;
  }

  override async loadWorkspaces(): Promise<WorkspaceUnit[]> {
    const { workspaces } = await ipcMethods.getWorkspaces({
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
