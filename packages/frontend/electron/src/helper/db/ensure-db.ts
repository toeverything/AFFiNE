import { logger } from '../logger';
import type { WorkspaceSQLiteDB } from './workspace-db-adapter';
import { openWorkspaceDatabase } from './workspace-db-adapter';

// export for testing
export const db$Map = new Map<string, Promise<WorkspaceSQLiteDB>>();

async function getWorkspaceDB(id: string) {
  let db = await db$Map.get(id);
  if (!db$Map.has(id)) {
    const promise = openWorkspaceDatabase(id);
    db$Map.set(id, promise);
    const _db = (db = await promise);
    const cleanup = () => {
      db$Map.delete(id);
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

export function ensureSQLiteDB(id: string) {
  return getWorkspaceDB(id);
}
