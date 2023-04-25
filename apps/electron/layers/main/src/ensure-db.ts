import { app } from 'electron';

import { logger } from '../../logger';
import { appContext } from './context';
import { watchFile } from './data/fs-watch';
import type { WorkspaceDatabase } from './data/sqlite';
import { openWorkspaceDatabase } from './data/sqlite';
import { sendMainEvent } from './send-main-event';

const dbMapping = new Map<string, WorkspaceDatabase>();
const dbWatchers = new Map<string, () => void>();

export async function ensureWorkspaceDB(id: string) {
  let workspaceDB = dbMapping.get(id);
  if (!workspaceDB) {
    // hmm... potential race condition?
    workspaceDB = await openWorkspaceDatabase(appContext, id);
    dbMapping.set(id, workspaceDB);

    logger.info('watch db file', workspaceDB.path);

    dbWatchers.set(
      id,
      watchFile(workspaceDB.path, (event, filename) => {
        const minTime = 1000;
        const db = workspaceDB;
        const lastUpdateTime = db?.lastUpdateTime ?? 0;
        const elapsed = Date.now() - lastUpdateTime;
        if (elapsed < minTime || !filename) {
          logger.debug('skip db file update', elapsed, filename);
          return;
        }
        logger.debug('db file changed', event, filename, elapsed);
        sendMainEvent('main:on-db-update', id);

        // handle DB file update by other process so we may need to reconnect to it
        dbWatchers.get(id)?.();
        dbMapping.delete(id);
        dbWatchers.delete(id);
        ensureWorkspaceDB(id);
      })
    );
  }
  return workspaceDB;
}

export async function cleanupWorkspaceDBs() {
  for (const [id, db] of dbMapping) {
    logger.info('close db connection', id);
    db.destroy();
    dbWatchers.get(id)?.();
  }
  dbMapping.clear();
  dbWatchers.clear();
}

app.on('activate', () => {
  for (const [_, workspaceDB] of dbMapping) {
    workspaceDB.reconnectDB();
  }
});
