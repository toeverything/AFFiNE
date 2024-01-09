import { apis } from '@affine/electron-api';
import type { SyncStorage } from '@affine/workspace';
import { encodeStateVectorFromUpdate } from 'yjs';

export function createSQLiteStorage(workspaceId: string): SyncStorage {
  if (!apis?.db) {
    throw new Error('sqlite datasource is not available');
  }

  return {
    name: 'sqlite',
    async pull(docId, _state) {
      if (!apis?.db) {
        throw new Error('sqlite datasource is not available');
      }
      const update = await apis.db.getDocAsUpdates(
        workspaceId,
        workspaceId === docId ? undefined : docId
      );

      if (update) {
        return {
          data: update,
          state: encodeStateVectorFromUpdate(update),
        };
      }

      return null;
    },
    async push(docId, data) {
      if (!apis?.db) {
        throw new Error('sqlite datasource is not available');
      }
      return apis.db.applyDocUpdate(
        workspaceId,
        data,
        workspaceId === docId ? undefined : docId
      );
    },
    async subscribe(_cb, _disconnect) {
      return () => {};
    },
  };
}
