import type { StorageConstructor } from '..';
import { IndexedDBBlobStorage } from './blob';
import { IndexedDBBlobSyncStorage } from './blob-sync';
import { IndexedDBDocStorage } from './doc';
import { IndexedDBDocSyncStorage } from './doc-sync';
import { IndexedDBIndexerStorage } from './indexer';
import { IndexedDBIndexerSyncStorage } from './indexer-sync';

export * from './blob';
export * from './blob-sync';
export * from './doc';
export * from './doc-sync';
export * from './indexer';
export * from './indexer-sync';

export const idbStorages = [
  IndexedDBDocStorage,
  IndexedDBBlobStorage,
  IndexedDBDocSyncStorage,
  IndexedDBBlobSyncStorage,
  IndexedDBIndexerStorage,
  IndexedDBIndexerSyncStorage,
] satisfies StorageConstructor[];

export const idbStoragesIndexerOnly = [
  IndexedDBIndexerStorage,
  IndexedDBIndexerSyncStorage,
] satisfies StorageConstructor[];
