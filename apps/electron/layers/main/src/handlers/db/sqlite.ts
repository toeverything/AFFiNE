import path from 'node:path';

import type { Database } from 'better-sqlite3';
import sqlite from 'better-sqlite3';
import fs from 'fs-extra';
import * as Y from 'yjs';

import type { AppContext } from '../../context';
import { logger } from '../../logger';
import { ts } from '../../utils';

const schemas = [
  `CREATE TABLE IF NOT EXISTS "updates" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data BLOB NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "blobs" (
  key TEXT PRIMARY KEY NOT NULL,
  data BLOB NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
)`,
];

interface UpdateRow {
  id: number;
  data: Buffer;
  timestamp: string;
}

interface BlobRow {
  key: string;
  data: Buffer;
  timestamp: string;
}

const SQLITE_ORIGIN = Symbol('sqlite-origin');

export class WorkspaceSQLiteDB {
  db: Database;
  ydoc = new Y.Doc();
  firstConnect = false;
  lastUpdateTime = ts();

  constructor(public path: string, public workspaceId: string) {
    this.db = this.reconnectDB();
  }

  // release resources
  destroy = () => {
    this.db?.close();
    this.ydoc.destroy();
  };

  getWorkspaceName = () => {
    return this.ydoc.getMap('space:meta').get('name') as string;
  };

  reconnectDB = () => {
    logger.log('open db', this.workspaceId);
    if (this.db) {
      this.db.close();
    }

    // use cached version?
    const db = (this.db = sqlite(this.path));
    db.exec(schemas.join(';'));

    if (!this.firstConnect) {
      this.ydoc.on('update', (update: Uint8Array, origin) => {
        if (origin !== SQLITE_ORIGIN) {
          this.addUpdateToSQLite(update);
        }
      });
    }

    Y.transact(this.ydoc, () => {
      const updates = this.getUpdates();
      updates.forEach(update => {
        // give SQLITE_ORIGIN to skip self update
        Y.applyUpdate(this.ydoc, update.data, SQLITE_ORIGIN);
      });
    });

    this.lastUpdateTime = ts();

    if (this.firstConnect) {
      logger.info('db reconnected', this.workspaceId);
    } else {
      logger.info('db connected', this.workspaceId);
    }

    this.firstConnect = true;

    return db;
  };

  getDocAsUpdates = () => {
    return Y.encodeStateAsUpdate(this.ydoc);
  };

  // non-blocking and use yDoc to validate the update
  // after that, the update is added to the db
  applyUpdate = (data: Uint8Array) => {
    Y.applyUpdate(this.ydoc, data);

    // todo: trim the updates when the number of records is too large
    // 1. store the current ydoc state in the db
    // 2. then delete the old updates
    // yjs-idb will always trim the db for the first time after DB is loaded
    this.lastUpdateTime = ts();
    logger.debug('applyUpdate', this.workspaceId, this.lastUpdateTime);
  };

  addBlob = (key: string, data: Uint8Array) => {
    this.lastUpdateTime = ts();
    try {
      const statement = this.db.prepare(
        'INSERT INTO blobs (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = ?'
      );
      statement.run(key, data, data);
      return key;
    } catch (error) {
      logger.error('addBlob', error);
    }
  };

  getBlob = (key: string) => {
    try {
      const statement = this.db.prepare('SELECT data FROM blobs WHERE key = ?');
      const row = statement.get(key) as BlobRow;
      if (!row) {
        return null;
      }
      return row.data;
    } catch (error) {
      logger.error('getBlob', error);
      return null;
    }
  };

  deleteBlob = (key: string) => {
    this.lastUpdateTime = ts();
    try {
      const statement = this.db.prepare('DELETE FROM blobs WHERE key = ?');
      statement.run(key);
    } catch (error) {
      logger.error('deleteBlob', error);
    }
  };

  getPersistentBlobKeys = () => {
    try {
      const statement = this.db.prepare('SELECT key FROM blobs');
      const rows = statement.all() as BlobRow[];
      return rows.map(row => row.key);
    } catch (error) {
      logger.error('getPersistentBlobKeys', error);
      return [];
    }
  };

  private getUpdates = () => {
    try {
      const statement = this.db.prepare('SELECT * FROM updates');
      const rows = statement.all() as UpdateRow[];
      return rows;
    } catch (error) {
      logger.error('getUpdates', error);
      return [];
    }
  };

  // batch write instead write per key stroke?
  private addUpdateToSQLite = (data: Uint8Array) => {
    try {
      const start = performance.now();
      const statement = this.db.prepare(
        'INSERT INTO updates (data) VALUES (?)'
      );
      statement.run(data);
      logger.debug(
        'addUpdateToSQLite',
        this.workspaceId,
        'length:',
        data.length,
        performance.now() - start,
        'ms'
      );
    } catch (error) {
      logger.error('addUpdateToSQLite', error);
    }
  };
}

export async function getWorkspaceDBPath(
  context: AppContext,
  workspaceId: string
) {
  const basePath = path.join(context.appDataPath, 'workspaces', workspaceId);
  await fs.ensureDir(basePath);
  return path.join(basePath, 'storage.db');
}

export async function openWorkspaceDatabase(
  context: AppContext,
  workspaceId: string
) {
  const dbPath = await getWorkspaceDBPath(context, workspaceId);
  return new WorkspaceSQLiteDB(dbPath, workspaceId);
}

export function isValidDBFile(path: string) {
  try {
    const db = sqlite(path);
    // check if db has two tables, one for updates and onefor blobs
    const statement = db.prepare(
      `SELECT name FROM sqlite_schema WHERE type='table'`
    );
    const rows = statement.all() as { name: string }[];
    const tableNames = rows.map(row => row.name);
    if (!tableNames.includes('updates') || !tableNames.includes('blobs')) {
      return false;
    }
    db.close();
    return true;
  } catch (error) {
    logger.error('isValidDBFile', error);
    return false;
  }
}
