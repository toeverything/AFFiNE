import { watch } from 'chokidar';

import { appContext } from '../../context';
import { subjects } from '../../events';
import { logger } from '../../logger';
import { debounce } from '../../utils';
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

  const debounceOnChange = debounce(() => {
    logger.info(
      'db file changed on disk',
      db.workspaceId,
      new Date().getTime() - db.lastUpdateTime,
      'ms'
    );
    // reconnect db
    db.reconnectDB();
    subjects.db.dbFileUpdate.next(db.workspaceId);
  }, 1000);

  watcher.on('change', () => {
    const currentTime = new Date().getTime();
    if (currentTime - db.lastUpdateTime > 100) {
      debounceOnChange();
    }
  });

  dbWatchers.set(db.workspaceId, () => {
    watcher.close();
  });

  // todo: there is still a possibility that the file is deleted
  // but we didn't get the event soon enough and another event tries to
  // access the db
  watcher.on('unlink', () => {
    logger.info('db file missing', db.workspaceId);
    subjects.db.dbFileMissing.next(db.workspaceId);
    // cleanup
    watcher.close().then(() => {
      db.destroy();
      dbWatchers.delete(db.workspaceId);
      dbMapping.delete(db.workspaceId);
    });
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

export function disconnectSQLiteDB(id: string) {
  const db = dbMapping.get(id);
  if (db) {
    db.destroy();
    dbWatchers.get(id)?.();
    dbWatchers.delete(id);
    dbMapping.delete(id);
  }
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
