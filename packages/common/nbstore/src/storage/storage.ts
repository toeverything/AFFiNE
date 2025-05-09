import type { Connection } from '../connection';

export type StorageType =
  | 'blob'
  | 'blobSync'
  | 'doc'
  | 'docSync'
  | 'awareness'
  | 'indexer'
  | 'indexerSync';

export interface Storage {
  readonly storageType: StorageType;
  readonly connection: Connection;
}
