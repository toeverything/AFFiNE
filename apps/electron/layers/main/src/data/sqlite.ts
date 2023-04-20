import path from 'node:path';

import fs from 'fs-extra';
import type { Database } from 'sqlite3';
import sqlite3Default from 'sqlite3';
import * as Y from 'yjs';

import { logger } from '../../../logger';
import type { AppContext } from '../context';

const sqlite3 = sqlite3Default.verbose();

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

sqlite3.verbose();

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

export class WorkspaceDatabase {
  sqliteDB$: Promise<Database>;
  ydoc = new Y.Doc();
  _db: Database | null = null;

  ready: Promise<Uint8Array>;

  constructor(public path: string) {
    this.sqliteDB$ = this.reconnectDB();
    logger.log('open db', path);

    this.ydoc.on('update', update => {
      this.addUpdateToSQLite(update);
    });

    this.ready = (async () => {
      const updates = await this.getUpdates();
      updates.forEach(update => {
        Y.applyUpdate(this.ydoc, update.data);
      });
      return this.getEncodedDocUpdates();
    })();
  }

  // release resources
  destroy = () => {
    this._db?.close();
    this.ydoc.destroy();
  };

  reconnectDB = async () => {
    logger.log('open db', this.path);
    if (this._db) {
      const _db = this._db;
      await new Promise<void>(res =>
        _db.close(() => {
          res();
        })
      );
    }
    return (this.sqliteDB$ = new Promise(res => {
      // use cached version?
      const db = new sqlite3.Database(this.path, error => {
        if (error) {
          logger.error('open db error', error);
        }
      });
      this._db = db;

      db.exec(schemas.join(';'), () => {
        res(db);
      });
    }));
  };

  getEncodedDocUpdates = () => {
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
  };

  addBlob = async (key: string, data: Uint8Array) => {
    const db = await this.sqliteDB$;
    return new Promise<void>((resolve, reject) => {
      db.run(
        'INSERT INTO blobs (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = ?',
        [key, data, data],
        err => {
          if (err) {
            logger.error('addBlob', err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  };

  getBlob = async (key: string) => {
    const db = await this.sqliteDB$;
    return new Promise<Uint8Array | null>((resolve, reject) => {
      db.get<BlobRow>(
        'SELECT data FROM blobs WHERE key = ?',
        [key],
        (err, row) => {
          if (err) {
            logger.error('getBlob', err);
            reject(err);
          } else if (!row) {
            logger.error('getBlob', 'not found');
            resolve(null);
          } else {
            resolve(row.data);
          }
        }
      );
    });
  };

  deleteBlob = async (key: string) => {
    const db = await this.sqliteDB$;
    return new Promise<void>((resolve, reject) => {
      db.run('DELETE FROM blobs WHERE key = ?', [key], err => {
        if (err) {
          logger.error('deleteBlob', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  getPersistentBlobKeys = async () => {
    const db = await this.sqliteDB$;
    return new Promise<string[]>((resolve, reject) => {
      db.all<BlobRow>('SELECT key FROM blobs', (err, rows) => {
        if (err) {
          logger.error('getPersistentBlobKeys', err);
          reject(err);
        } else {
          resolve(rows.map(row => row.key));
        }
      });
    });
  };

  private getUpdates = async () => {
    const db = await this.sqliteDB$;
    return new Promise<{ id: number; data: any }[]>((resolve, reject) => {
      // do we need to order by id?
      db.all<UpdateRow>('SELECT * FROM updates', (err, rows) => {
        if (err) {
          logger.error('getUpdates', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  };

  private addUpdateToSQLite = async (data: Uint8Array) => {
    const db = await this.sqliteDB$;
    return new Promise<void>((resolve, reject) => {
      db.run('INSERT INTO updates (data) VALUES (?)', [data], err => {
        if (err) {
          logger.error('addUpdateToSQLite', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };
}

export async function openWorkspaceDatabase(
  context: AppContext,
  workspaceId: string
) {
  const basePath = path.join(context.appDataPath, 'workspaces', workspaceId);
  // hmmm.... blocking api but it should be fine, right?
  await fs.ensureDir(basePath);
  const dbPath = path.join(basePath, 'storage.db');

  return new WorkspaceDatabase(dbPath);
}
