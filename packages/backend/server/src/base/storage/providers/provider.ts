import type { Readable } from 'node:stream';

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
  put(
    key: string,
    body: BlobInputType,
    metadata?: PutObjectMetadata
  ): Promise<void>;
  head(key: string): Promise<GetObjectMetadata | undefined>;
  get(
    key: string,
    signedUrl?: boolean
  ): Promise<{
    redirectUrl?: string;
    body?: BlobOutputType;
    metadata?: GetObjectMetadata;
  }>;
  list(prefix?: string): Promise<ListObjectsMetadata[]>;
  delete(key: string): Promise<void>;
}
