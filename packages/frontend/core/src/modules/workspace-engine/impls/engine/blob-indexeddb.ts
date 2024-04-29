import type { BlobStorage } from '@toeverything/infra';
import { createStore, del, get, keys, set } from 'idb-keyval';

import { bufferToBlob } from '../../utils/buffer-to-blob';

export class IndexedDBBlobStorage implements BlobStorage {
  constructor(private readonly workspaceId: string) {}

  name = 'indexeddb';
  readonly = false;
  db = createStore(`${this.workspaceId}_blob`, 'blob');
  mimeTypeDb = createStore(`${this.workspaceId}_blob_mime`, 'blob_mime');

  async get(key: string) {
    const res = await get<ArrayBuffer>(key, this.db);
    if (res) {
      return bufferToBlob(res);
    }
    return null;
  }
  async set(key: string, value: Blob) {
    await set(key, await value.arrayBuffer(), this.db);
    await set(key, value.type, this.mimeTypeDb);
    return key;
  }
  async delete(key: string) {
    await del(key, this.db);
    await del(key, this.mimeTypeDb);
  }
  async list() {
    return keys<string>(this.db);
  }
}
