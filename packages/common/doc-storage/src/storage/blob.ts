import { Storage, type StorageOptions } from './storage';

export interface BlobStorageOptions extends StorageOptions {}

export interface BlobRecord {
  key: string;
  data: ArrayBuffer;
  mime: string;
  size: number;
  createdAt: number;
}

export interface ListedBlobRecord {
  key: string;
  mime: string;
  size: number;
  createdAt: number;
}

export abstract class BlobStorage<
  Options extends BlobStorageOptions = BlobStorageOptions,
> extends Storage<Options> {
  abstract getBlob(key: string): Promise<BlobRecord | null>;
  abstract setBlob(blob: BlobRecord): Promise<void>;
  abstract deleteBlob(key: string, permanently: boolean): Promise<void>;
  abstract releaseBlobs(): Promise<void>;
  abstract listBlobs(/* pagination? */): Promise<ListedBlobRecord[]>;
}
