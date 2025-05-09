import type { StorageConstructor } from '../..';
import { SqliteV1BlobStorage } from './blob';
import { SqliteV1DocStorage } from './doc';

export * from './blob';
export { bindNativeDBV1Apis } from './db';
export * from './doc';

export const sqliteV1Storages = [
  SqliteV1DocStorage,
  SqliteV1BlobStorage,
] satisfies StorageConstructor[];
