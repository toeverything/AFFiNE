import { encodeStateVectorFromUpdate } from 'yjs';

import type { Storage } from '..';

export function createSQLiteStorage(workspaceId: string): Storage {
  if (!window.apis?.db) {
    throw new Error('sqlite datasource is not available');
  }

  return {
    name: 'sqlite',
    async pull(docId, _state) {
      const update = await window.apis.db.getDocAsUpdates(
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
      return window.apis.db.applyDocUpdate(
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
