import { type InsertRow, SqliteConnection } from '@affine/native';

import { logger } from '../logger';

/**
 * A base class for SQLite DB adapter that provides basic methods around updates & blobs
 */
export abstract class BaseSQLiteAdapter {
  db: SqliteConnection | null = null;
  abstract role: string;

  constructor(public readonly path: string) {}

  async connectIfNeeded() {
    if (!this.db) {
      this.db = new SqliteConnection(this.path);
      await this.db.connect();
      logger.info(`[SQLiteAdapter:${this.role}]`, 'connected:', this.path);
    }
    return this.db;
  }

  async destroy() {
    const { db } = this;
    this.db = null;
    // log after close will sometimes crash the app when quitting
    logger.info(`[SQLiteAdapter:${this.role}]`, 'destroyed:', this.path);
    await db?.close();
  }

  async addBlob(key: string, data: Uint8Array) {
    try {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      await this.db.addBlob(key, data);
    } catch (error) {
      logger.error('addBlob', error);
    }
  }

  async getBlob(key: string) {
    try {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return null;
      }
      const blob = await this.db.getBlob(key);
      return blob?.data ?? null;
    } catch (error) {
      logger.error('getBlob', error);
      return null;
    }
  }

  async deleteBlob(key: string) {
    try {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      await this.db.deleteBlob(key);
    } catch (error) {
      logger.error(`${this.path} delete blob failed`, error);
    }
  }

  async getBlobKeys() {
    try {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return [];
      }
      return await this.db.getBlobKeys();
    } catch (error) {
      logger.error(`getBlobKeys failed`, error);
      return [];
    }
  }

  async getUpdates(docId?: string) {
    try {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return [];
      }
      return await this.db.getUpdates(docId);
    } catch (error) {
      logger.error('getUpdates', error);
      return [];
    }
  }

  async getAllUpdates() {
    try {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return [];
      }
      return await this.db.getAllUpdates();
    } catch (error) {
      logger.error('getAllUpdates', error);
      return [];
    }
  }

  // add a single update to SQLite
  async addUpdateToSQLite(updates: InsertRow[]) {
    // batch write instead write per key stroke?
    try {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      const start = performance.now();
      await this.db.insertUpdates(updates);
      logger.debug(
        `[SQLiteAdapter][${this.role}] addUpdateToSQLite`,
        'length:',
        updates.length,
        'docids',
        updates.map(u => u.docId),
        performance.now() - start,
        'ms'
      );
    } catch (error) {
      logger.error('addUpdateToSQLite', this.path, error);
    }
  }
}
