import assert from 'assert';
import type { Database } from 'better-sqlite3';
import sqlite from 'better-sqlite3';

import { logger } from '../logger';

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

/**
 * A base class for SQLite DB adapter that provides basic methods around updates & blobs
 */
export abstract class BaseSQLiteAdapter {
  db: Database | null = null;
  abstract role: string;

  constructor(public path: string) {}

  ensureTables() {
    assert(this.db, 'db is not connected');
    this.db.exec(schemas.join(';'));
  }

  // todo: what if SQLite DB wrapper later is not sync?
  connect(): Database | undefined {
    if (this.db) {
      return this.db;
    }
    logger.log(`[SQLiteAdapter][${this.role}] open db`, this.path);
    const db = (this.db = sqlite(this.path));
    this.ensureTables();
    return db;
  }

  destroy() {
    this.db?.close();
    this.db = null;
  }

  addBlob(key: string, data: Uint8Array) {
    try {
      assert(this.db, 'db is not connected');
      const statement = this.db.prepare(
        'INSERT INTO blobs (key, data) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET data = ?'
      );
      statement.run(key, data, data);
      return key;
    } catch (error) {
      logger.error('addBlob', error);
    }
  }

  getBlob(key: string) {
    try {
      assert(this.db, 'db is not connected');
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
  }

  deleteBlob(key: string) {
    try {
      assert(this.db, 'db is not connected');
      const statement = this.db.prepare('DELETE FROM blobs WHERE key = ?');
      statement.run(key);
    } catch (error) {
      logger.error('deleteBlob', error);
    }
  }

  getBlobKeys() {
    try {
      assert(this.db, 'db is not connected');
      const statement = this.db.prepare('SELECT key FROM blobs');
      const rows = statement.all() as BlobRow[];
      return rows.map(row => row.key);
    } catch (error) {
      logger.error('getBlobKeys', error);
      return [];
    }
  }

  getUpdates() {
    try {
      assert(this.db, 'db is not connected');
      const statement = this.db.prepare('SELECT * FROM updates');
      const rows = statement.all() as UpdateRow[];
      return rows;
    } catch (error) {
      logger.error('getUpdates', error);
      return [];
    }
  }

  // add a single update to SQLite
  addUpdateToSQLite(updates: Uint8Array[]) {
    // batch write instead write per key stroke?
    try {
      assert(this.db, 'db is not connected');
      const start = performance.now();
      const statement = this.db.prepare(
        'INSERT INTO updates (data) VALUES (?)'
      );
      const insertMany = this.db.transaction(updates => {
        for (const d of updates) {
          statement.run(d);
        }
      });

      insertMany(updates);

      logger.debug(
        `[SQLiteAdapter][${this.role}] addUpdateToSQLite`,
        'length:',
        updates.length,
        performance.now() - start,
        'ms'
      );
    } catch (error) {
      logger.error('addUpdateToSQLite', error);
    }
  }
}
