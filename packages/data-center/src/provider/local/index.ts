import type { BlobStorage } from '@blocksuite/store';
import assert from 'assert';

import type { InitialParams } from '../index.js';
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
  }

  async clear() {
    await super.clear();
    await this._blobs.clear();
    await this._idb?.clearData();
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
}
