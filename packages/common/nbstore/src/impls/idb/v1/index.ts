import type { StorageConstructor } from '../..';
import { IndexedDBV1BlobStorage } from './blob';
import { IndexedDBV1DocStorage } from './doc';

export * from './blob';
export * from './doc';

export const idbV1Storages = [
  IndexedDBV1DocStorage,
  IndexedDBV1BlobStorage,
] satisfies StorageConstructor[];
