import type { Readable } from 'node:stream';

import { StorageProviderType } from '../config';

export interface GetObjectMetadata {
  /**
   * @default 'application/octet-stream'
   */
  contentType: string;
  contentLength: number;
  lastModified: Date;
  checksumCRC32?: string;
}

export interface PutObjectMetadata {
  contentType?: string;
  contentLength?: number;
  checksumCRC32?: string;
}

export interface ListObjectsMetadata {
  key: string;
  lastModified: Date;
  contentLength: number;
}

export type BlobInputType = Buffer | Readable | string;
export type BlobOutputType = Readable;

export interface StorageProvider {
  readonly type: StorageProviderType;
  put(
    key: string,
    body: BlobInputType,
    metadata?: PutObjectMetadata
  ): Promise<void>;
  get(
    key: string
  ): Promise<{ body?: BlobOutputType; metadata?: GetObjectMetadata }>;
  list(prefix?: string): Promise<ListObjectsMetadata[]>;
  delete(key: string): Promise<void>;
}
