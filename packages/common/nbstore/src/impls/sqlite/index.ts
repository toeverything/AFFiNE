import type { StorageConstructor } from '..';
import { SqliteBlobStorage } from './blob';
import { SqliteBlobSyncStorage } from './blob-sync';
import { SqliteDocStorage } from './doc';
import { SqliteDocSyncStorage } from './doc-sync';

export * from './blob';
export * from './blob-sync';
export { bindNativeDBApis, type NativeDBApis } from './db';
export * from './doc';
export * from './doc-sync';

export const sqliteStorages = [
  SqliteDocStorage,
  SqliteBlobStorage,
  SqliteDocSyncStorage,
  SqliteBlobSyncStorage,
] satisfies StorageConstructor[];
