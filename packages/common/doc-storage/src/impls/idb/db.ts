import { type IDBPDatabase, openDB } from 'idb';

import { type DocStorageSchema, latestVersion, migrate } from './schema';

export type SpaceIDB = IDBPDatabase<DocStorageSchema>;

export const IDBProtocol = {
  async open(name: string) {
    let db: SpaceIDB | null = null;
    const blocking = () => {
      // notify user this connection is blocking other tabs to upgrade db
      db?.close();
    };

    const blocked = () => {
      // notify user there is tab opened with old version, close it first
    };

    db = await openDB<DocStorageSchema>(name, latestVersion, {
      upgrade: migrate,
      blocking,
      blocked,
    });

    return db;
  },
};
