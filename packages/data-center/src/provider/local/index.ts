import type { BlobStorage } from '@blocksuite/store';
import assert from 'assert';

import type { ConfigStore, InitialParams, Logger } from '../index.js';
import { BaseProvider } from '../base.js';
import { IndexedDBProvider } from './indexeddb.js';

export class LocalProvider extends BaseProvider {
  static id = 'local';
  private _blobs!: BlobStorage;
  private _idb?: IndexedDBProvider = undefined;

  constructor() {
    super();
  }
  async init(params: InitialParams) {
    super.init(params);

    const blobs = await this._workspace.blobs;
    assert(blobs);
    this._blobs = blobs;
  }

  async initData() {
    assert(this._workspace.room);
    this._logger('Loading local data');
    this._idb = new IndexedDBProvider(
      this._workspace.room,
      this._workspace.doc
    );

    await this._idb.whenSynced;
    this._logger('Local data loaded');

    this._signals.listAdd.emit({
      workspace: this._workspace.room,
      provider: this.id,
      locally: true,
    });
  }

  async clear() {
    assert(this._workspace.room);
    await super.clear();
    await this._blobs.clear();
    await this._idb?.clearData();
    this._signals.listRemove.emit(this._workspace.room);
  }

  async destroy(): Promise<void> {
    super.destroy();
    await this._idb?.destroy();
  }

  async getBlob(id: string): Promise<string | null> {
    return this._blobs.get(id);
  }

  async setBlob(blob: Blob): Promise<string> {
    return this._blobs.set(blob);
  }

  static async auth(_config: Readonly<ConfigStore>, logger: Logger) {
    logger("Local provider doesn't require authentication");
  }

  static async list(
    config: Readonly<ConfigStore<boolean>>
  ): Promise<Map<string, boolean> | undefined> {
    const entries = await config.entries();
    return new Map(
      entries
        .filter(([key]) => key.startsWith('list:'))
        .map(([key, value]) => [key.slice(5), value])
    );
  }
}
