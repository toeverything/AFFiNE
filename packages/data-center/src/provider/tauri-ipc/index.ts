import * as Y from 'yjs';
import assert from 'assert';

import type { ConfigStore, InitialParams } from '../index.js';
import { LocalProvider } from '../local/index.js';
import * as ipcMethods from './ipc/methods.js';

export class TauriIPCProvider extends LocalProvider {
  static id = 'tauri-ipc';
  #ipc = ipcMethods;

  async init(params: InitialParams) {
    super.init(params);
  }

  async initData() {
    assert(this._workspace.room);
    this._logger('Loading local data');
    const {
      doc,
      room,
      meta: { id },
    } = this._workspace;
    this.#initDocFromIPC(id, doc);
    doc.on(
      'update',
      async (
        update: Uint8Array,
        _origin: any,
        _yDocument: Y.Doc,
        _transaction: Y.Transaction
      ) => {
        try {
          // TODO: need handle potential data race when update is frequent?
          // TODO: update seems too frequent upon each keydown, why no batching?
          const success = await this.#ipc.updateYDocument({
            update: Array.from(update),
            id: Number(id),
          });
          if (!success) {
            throw new Error(
              `YDoc update failed, id: ${this.workspace.meta.id}`
            );
          }
        } catch (error) {
          // TODO: write error log to disk, and add button to open them in settings panel
          console.error("#yDocument.on('update'", error);
        }
      }
    );
    this._logger('Local data loaded');
  }

  async #initDocFromIPC(workspaceID: string, doc: Y.Doc) {
    this._logger(`Loading ${workspaceID}...`);
    const updates = await this.#ipc.getYDocument({ id: Number(workspaceID) });
    if (updates) {
      await new Promise(resolve => {
        doc.once('update', resolve);
        Y.applyUpdate(doc, new Uint8Array(updates.update));
      });
      this._logger(`Loaded: ${workspaceID}`);

      // only add to list as online workspace
      this._signals.listAdd.emit({
        workspace: workspaceID,
        provider: this.id,
        locally: true,
      });
    }
  }

  async clear() {
    await super.clear();
  }

  async destroy(): Promise<void> {
    super.destroy();
  }

  async getBlob(id: string) {
    const blobArray = await this.#ipc.getBlob({
      workspace_id: this.id,
      id,
    });
    // Make a Blob from the bytes
    const blob = new Blob([new Uint8Array(blobArray)], { type: 'image/bmp' });
    return window.URL.createObjectURL(blob);
  }

  async setBlob(blob: Blob) {
    return this.#ipc.putBlob({
      blob: Array.from(new Uint8Array(await blob.arrayBuffer())),
      workspace_id: this.id,
    });
  }

  async createWorkspace(
    name: string
  ): Promise<{ id: string; name: string } | undefined> {
    // TODO: get userID here
    return this.#ipc.createWorkspace({ name, user_id: 0 });
  }

  async getWorkspaces(
    config: Readonly<ConfigStore<boolean>>
  ): Promise<Map<string, boolean> | undefined> {
    const entries = await config.entries();
    return new Map(entries);
  }
}
