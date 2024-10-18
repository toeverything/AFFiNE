import { type IDBPDatabase, openDB } from 'idb';

import { type DocStorageSchema, latestVersion, migrate } from './schema';

export type SpaceIDB = IDBPDatabase<DocStorageSchema>;

export const IDBProtocol = {
  open(name: string) {
    const blocking = () => {
      // notify user this connection is blocking other tabs to upgrade db
    };

    const blocked = () => {
      // notify user there is tab opened with old version, close it first
    };

    return openDB<DocStorageSchema>(name, latestVersion, {
      upgrade: migrate,
      blocking,
      blocked,
    });
  },
};
