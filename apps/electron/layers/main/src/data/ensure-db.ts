import { watch } from 'chokidar';

import { logger } from '../../../logger';
import { appContext } from '../context';
import { sendMainEvent } from '../send-main-event';
import type { WorkspaceSQLiteDB } from './sqlite';
import { openWorkspaceDatabase } from './sqlite';

const dbMapping = new Map<string, WorkspaceSQLiteDB>();
const dbWatchers = new Map<string, () => void>();

// if we removed the file, we will stop watching it
function startWatchingDBFile(db: WorkspaceSQLiteDB) {
  if (dbWatchers.has(db.workspaceId)) {
    return dbWatchers.get(db.workspaceId);
  }
  logger.info('watch db file', db.path);
  const watcher = watch(db.path);

  watcher.on('change', () => {
    const currentTime = new Date().getTime();
    if (currentTime - db.lastUpdateTime > 1000) {
      logger.info(
        'db file changed',
        db.workspaceId,
        currentTime - db.lastUpdateTime
      );
      // reconnect db
      db.reconnectDB();
      sendMainEvent('main:on-db-file-update', db.workspaceId);
    }
  });

  watcher.on('unlink', () => {
    logger.info('db file missing', db.workspaceId);
    sendMainEvent('main:on-db-file-missing', db.workspaceId);

    // cleanup
    watcher.close();
    db.destroy();
    dbWatchers.delete(db.workspaceId);
    dbMapping.delete(db.workspaceId);
  });
}

export async function ensureSQLiteDB(id: string) {
  let workspaceDB = dbMapping.get(id);
  if (!workspaceDB) {
    // hmm... potential race condition?
    workspaceDB = await openWorkspaceDatabase(appContext, id);
    dbMapping.set(id, workspaceDB);
    startWatchingDBFile(workspaceDB);
  }
  return workspaceDB;
}

export async function cleanupSQLiteDBs() {
  for (const [id, db] of dbMapping) {
    logger.info('close db connection', id);
    db.destroy();
    dbWatchers.get(id)?.();
  }
  dbMapping.clear();
  dbWatchers.clear();
}
