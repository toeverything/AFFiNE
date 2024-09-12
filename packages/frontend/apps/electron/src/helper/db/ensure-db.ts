import { logger } from '../logger';
import type { SpaceType } from './types';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';
import { openWorkspaceDatabase } from './workspace-db-adapter';

// export for testing
export const db$Map = new Map<
  `${SpaceType}:${string}`,
  Promise<WorkspaceSQLiteDB>
>();

async function getWorkspaceDB(spaceType: SpaceType, id: string) {
  const cacheId = `${spaceType}:${id}` as const;
  let db = await db$Map.get(cacheId);
  if (!db) {
    const promise = openWorkspaceDatabase(spaceType, id);
    db$Map.set(cacheId, promise);
    const _db = (db = await promise);
    const cleanup = () => {
      db$Map.delete(cacheId);
      _db
        .destroy()
        .then(() => {
          logger.info('[ensureSQLiteDB] db connection closed', _db.workspaceId);
        })
        .catch(err => {
          logger.error('[ensureSQLiteDB] destroy db failed', err);
        });
    };

    db.update$.subscribe({
      complete: cleanup,
    });

    process.on('beforeExit', cleanup);
  }
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return db!;
}

export function ensureSQLiteDB(spaceType: SpaceType, id: string) {
  return getWorkspaceDB(spaceType, id);
}
