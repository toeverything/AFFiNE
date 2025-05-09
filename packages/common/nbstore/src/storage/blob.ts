import type { Connection } from '../connection';
import { type Storage } from './storage';

export interface BlobRecord {
  key: string;
  data: Uint8Array;
  mime: string;
  createdAt?: Date;
}

export interface ListedBlobRecord {
  key: string;
  mime: string;
  size: number;
  createdAt?: Date;
}

export interface BlobStorage extends Storage {
  readonly storageType: 'blob';
  readonly isReadonly: boolean;
  get(key: string, signal?: AbortSignal): Promise<BlobRecord | null>;
  set(blob: BlobRecord, signal?: AbortSignal): Promise<void>;
  delete(
    key: string,
    permanently: boolean,
    signal?: AbortSignal
  ): Promise<void>;
  release(signal?: AbortSignal): Promise<void>;
  list(signal?: AbortSignal): Promise<ListedBlobRecord[]>;
}

export abstract class BlobStorageBase implements BlobStorage {
  readonly storageType = 'blob';
  abstract readonly connection: Connection;
  abstract readonly isReadonly: boolean;
  abstract get(key: string, signal?: AbortSignal): Promise<BlobRecord | null>;
  abstract set(blob: BlobRecord, signal?: AbortSignal): Promise<void>;
  abstract delete(
    key: string,
    permanently: boolean,
    signal?: AbortSignal
  ): Promise<void>;
  abstract release(signal?: AbortSignal): Promise<void>;
  abstract list(signal?: AbortSignal): Promise<ListedBlobRecord[]>;
}
