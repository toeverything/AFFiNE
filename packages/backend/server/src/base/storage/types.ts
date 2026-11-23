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

export interface PresignedUpload {
  url: string;
  headers?: Record<string, string>;
  expiresAt: Date;
}
