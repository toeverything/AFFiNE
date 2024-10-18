import { Storage, type StorageOptions } from './storage';

export interface BlobStorageOptions extends StorageOptions {}

export interface Blob {
  key: string;
  data: Uint8Array;
  mime: string;
}

export interface ListedBlob {
  key: string;
  size: number;
}

export abstract class BlobStorage<
  Options extends BlobStorageOptions = BlobStorageOptions,
> extends Storage<Options> {
  abstract getBlob(key: string): Promise<Blob | null>;
  abstract setBlob(blob: Blob): Promise<void>;
  abstract deleteBlob(key: string, permanently: boolean): Promise<void>;
  abstract releaseBlobs(): Promise<void>;
  abstract listBlobs(/* pagination? */): Promise<ListedBlob[]>;
}
