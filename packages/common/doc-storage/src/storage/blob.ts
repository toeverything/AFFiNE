import { Connection } from './connection';

export interface BlobStorageOptions {
  spaceType: string;
  spaceId: string;
}

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
> extends Connection {
  public readonly options: Options;

  constructor(opts: Options) {
    super();
    this.options = opts;
  }

  get spaceType() {
    return this.options.spaceType;
  }

  get spaceId() {
    return this.options.spaceId;
  }

  abstract getBlob(key: string): Promise<Blob | null>;
  abstract setBlob(blob: Blob): Promise<void>;
  abstract deleteBlob(key: string, permanently: boolean): Promise<void>;
  abstract releaseBlobs(): Promise<void>;
  abstract listBlobs(/* pagination? */): Promise<ListedBlob[]>;
}
