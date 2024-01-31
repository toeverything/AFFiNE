import { apis } from '@affine/electron-api';
import { type SyncStorage } from '@toeverything/infra';
import { encodeStateVectorFromUpdate } from 'yjs';

export class SQLiteSyncStorage implements SyncStorage {
  name = 'sqlite';
  constructor(private readonly workspaceId: string) {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
  }

  async pull(docId: string, _state: Uint8Array) {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    const update = await apis.db.getDocAsUpdates(
      this.workspaceId,
      this.workspaceId === docId ? undefined : docId
    );

    if (update) {
      return {
        data: update,
        state: encodeStateVectorFromUpdate(update),
      };
    }

    return null;
  }

  async push(docId: string, data: Uint8Array) {
    if (!apis?.db) {
      throw new Error('sqlite datasource is not available');
    }
    return apis.db.applyDocUpdate(
      this.workspaceId,
      data,
      this.workspaceId === docId ? undefined : docId
    );
  }

  async subscribe() {
    return () => {};
  }
}
