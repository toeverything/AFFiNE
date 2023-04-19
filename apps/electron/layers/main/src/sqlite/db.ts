import path from 'node:path';

import fs from 'fs-extra';
import type { Database } from 'sqlite3';
import sqlite3Default from 'sqlite3';
import * as Y from 'yjs';

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
  sqliteDB: Database;
  ydoc = new Y.Doc();

  ready: Promise<Uint8Array>;

  constructor(public path: string) {
    this.sqliteDB = new sqlite3.Database(path);
    console.log('open db', path);
    schemas.forEach(schema => this.sqliteDB.run(schema));

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
    this.sqliteDB.close();
    this.ydoc.destroy();
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
    return new Promise<void>((resolve, reject) => {
      this.sqliteDB.run(
        'INSERT INTO blobs (key, data) VALUES (?, ?)',
        [key, data],
        err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  };

  getBlob = async (key: string) => {
    return new Promise<Uint8Array>((resolve, reject) => {
      this.sqliteDB.get<BlobRow>(
        'SELECT data FROM blobs WHERE key = ?',
        [key],
        (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.data);
          }
        }
      );
    });
  };

  getPersistentBlobKeys = async () => {
    return new Promise<string[]>((resolve, reject) => {
      this.sqliteDB.all<BlobRow>('SELECT key FROM blobs', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows.map(row => row.key));
        }
      });
    });
  };

  private getUpdates = async () => {
    return new Promise<{ id: number; data: any }[]>((resolve, reject) => {
      // do we need to order by id?
      this.sqliteDB.all<UpdateRow>('SELECT * FROM updates', (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  };

  private addUpdateToSQLite = async (data: Uint8Array) => {
    return new Promise<void>((resolve, reject) => {
      this.sqliteDB.run(
        'INSERT INTO updates (data) VALUES (?)',
        [data],
        err => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  };
}

export function openWorkspaceDatabase(
  context: AppContext,
  workspaceId: string
) {
  const basePath = path.join(context.appDataPath, 'workspaces', workspaceId);
  // hmmm.... blocking api but it should be fine, right?
  fs.ensureDirSync(basePath);
  const dbPath = path.join(basePath, 'storage.db');
  return new WorkspaceDatabase(dbPath);
}
