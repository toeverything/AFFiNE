import type { InsertRow } from '@affine/native';
import { SqliteConnection } from '@affine/native';
import type { ByteKVBehavior } from '@toeverything/infra/storage';

import { logger } from '../../logger';

/**
 * A base class for SQLite DB adapter that provides basic methods around updates & blobs
 */
export class SQLiteAdapter {
  db: SqliteConnection | null = null;
  constructor(public readonly path: string) {}

  async connectIfNeeded() {
    if (!this.db) {
      this.db = new SqliteConnection(this.path);
      await this.db.connect();
      logger.info(`[SQLiteAdapter]`, 'connected:', this.path);
    }
    return this.db;
  }

  async destroy() {
    const { db } = this;
    this.db = null;
    // log after close will sometimes crash the app when quitting
    logger.info(`[SQLiteAdapter]`, 'destroyed:', this.path);
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
        `[SQLiteAdapter] addUpdateToSQLite`,
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

  async deleteUpdates(docId?: string) {
    try {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      await this.db.deleteUpdates(docId);
    } catch (error) {
      logger.error('deleteUpdates', error);
    }
  }

  async checkpoint() {
    try {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      await this.db.checkpoint();
    } catch (error) {
      logger.error('checkpoint', error);
    }
  }

  async getUpdatesCount(docId?: string) {
    try {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return 0;
      }
      return await this.db.getUpdatesCount(docId);
    } catch (error) {
      logger.error('getUpdatesCount', error);
      return 0;
    }
  }

  async replaceUpdates(docId: string | null | undefined, updates: InsertRow[]) {
    try {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      await this.db.replaceUpdates(docId, updates);
    } catch (error) {
      logger.error('replaceUpdates', error);
    }
  }

  serverClock: ByteKVBehavior = {
    get: async key => {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return null;
      }
      const blob = await this.db.getServerClock(key);
      return blob?.data ?? null;
    },
    set: async (key, data) => {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      await this.db.setServerClock(key, data);
    },
    keys: async () => {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return [];
      }
      return await this.db.getServerClockKeys();
    },
    del: async key => {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      await this.db.delServerClock(key);
    },
    clear: async () => {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      await this.db.clearServerClock();
    },
  };

  syncMetadata: ByteKVBehavior = {
    get: async key => {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return null;
      }
      const blob = await this.db.getSyncMetadata(key);
      return blob?.data ?? null;
    },
    set: async (key, data) => {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      await this.db.setSyncMetadata(key, data);
    },
    keys: async () => {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return [];
      }
      return await this.db.getSyncMetadataKeys();
    },
    del: async key => {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      await this.db.delSyncMetadata(key);
    },
    clear: async () => {
      if (!this.db) {
        logger.warn(`${this.path} is not connected`);
        return;
      }
      await this.db.clearSyncMetadata();
    },
  };

  async getDocTimestamps() {
    if (!this.db) {
      logger.warn(`${this.path} is not connected`);
      return [];
    }
    return await this.db.getDocTimestamps();
  }
}
