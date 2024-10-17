import { type IDBPDatabase, openDB } from 'idb';

import { type DocStorageSchema, latestVersion, migrate } from './schema';

export type SpaceIDB = IDBPDatabase<DocStorageSchema>;

export class SpaceIndexedDbManager {
  private static db: SpaceIDB | null = null;

  static async open(name: string) {
    if (this.db) {
      return this.db;
    }

    const blocking = () => {
      // notify user this connection is blocking other tabs to upgrade db
      this.db?.close();
    };

    const blocked = () => {
      // notify user there is tab opened with old version, close it first
    };

    this.db = await openDB<DocStorageSchema>(name, latestVersion, {
      upgrade: migrate,
      blocking,
      blocked,
    });

    return this.db;
  }
}
