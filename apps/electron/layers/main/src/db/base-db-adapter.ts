import { SqliteConnection } from '@affine/native';
import assert from 'assert';

import { logger } from '../logger';

/**
 * A base class for SQLite DB adapter that provides basic methods around updates & blobs
 */
export abstract class BaseSQLiteAdapter {
  db: SqliteConnection | null = null;
  abstract role: string;

  constructor(public readonly path: string) {
    logger.info(`[SQLiteAdapter]`, 'path:', path);
  }

  async connectIfNeeded() {
    if (!this.db) {
      this.db = new SqliteConnection(this.path);
      await this.db.connect();
    }
    return this.db;
  }

  async destroy() {
    const { db } = this;
    this.db = null;
    await db?.close();
  }

  async addBlob(key: string, data: Uint8Array) {
    try {
      assert(this.db, `${this.path} is not connected`);
      await this.db.addBlob(key, data);
    } catch (error) {
      logger.error('addBlob', error);
    }
  }

  async getBlob(key: string) {
    try {
      assert(this.db, `${this.path} is not connected`);
      const blob = await this.db.getBlob(key);
      return blob?.data;
    } catch (error) {
      logger.error('getBlob', error);
      return null;
    }
  }

  async deleteBlob(key: string) {
    try {
      assert(this.db, `${this.path} is not connected`);
      await this.db.deleteBlob(key);
    } catch (error) {
      logger.error(`${this.path} delete blob failed`, error);
    }
  }

  async getBlobKeys() {
    try {
      assert(this.db, `${this.path} is not connected`);
      return await this.db.getBlobKeys();
    } catch (error) {
      logger.error(`getBlobKeys failed`, error);
      return [];
    }
  }

  async getUpdates() {
    try {
      assert(this.db, `${this.path} is not connected`);
      return await this.db.getUpdates();
    } catch (error) {
      logger.error('getUpdates', error);
      return [];
    }
  }

  // add a single update to SQLite
  async addUpdateToSQLite(db: SqliteConnection, updates: Uint8Array[]) {
    // batch write instead write per key stroke?
    try {
      const start = performance.now();
      await db.connect();
      await db.insertUpdates(updates);
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
