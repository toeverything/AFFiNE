import type { BlobRecord, BlobStorage } from '../storage';
import { SingletonLocker } from '../storage/lock';
import type { BlobSync } from '../sync/blob';

export class BlobFrontend {
  // Since 'set' and 'get' operations may be called in rapid succession, we use a lock mechanism
  // to ensure that 'get' requests for the same blob are paused when a 'set' operation is in progress.
  private readonly lock = new SingletonLocker();
  constructor(
    readonly storage: BlobStorage,
    private readonly sync: BlobSync
  ) {}

  get state$() {
    return this.sync.state$;
  }

  blobState$(blobId: string) {
    return this.sync.blobState$(blobId);
  }

  async get(blobId: string) {
    await this.waitForConnected();
    await using lock = await this.lock.lock('blob', blobId);
    const local = await this.storage.get(blobId);
    if (local) {
      return local;
    }
    await lock[Symbol.asyncDispose]();

    await this.sync.downloadBlob(blobId).catch(() => {
      // ignore the error as it has already been recorded in the sync status
    });
    return await this.storage.get(blobId);
  }

  async set(blob: BlobRecord) {
    await this.waitForConnected();
    await using lock = await this.lock.lock('blob', blob.key);
    await this.storage.set(blob);
    await lock[Symbol.asyncDispose]();

    // We don't wait for the upload to complete,
    // as the upload process runs asynchronously in the background
    this.sync.uploadBlob(blob, true /* force upload */).catch(() => {
      // ignore the error as it has already been recorded in the sync status
    });

    return;
  }

  /**
   * Uploads a blob to the peer. Do nothing if the blob has already been uploaded.
   *
   * @returns Always resolves to true when successful
   *
   * @throws This method will throw an error if the blob is not found locally, if the upload is aborted, or if it fails due to storage limitations.
   */
  async upload(blobIdOrRecord: string | BlobRecord): Promise<boolean> {
    await this.waitForConnected();
    const blob =
      typeof blobIdOrRecord === 'string'
        ? await this.storage.get(blobIdOrRecord)
        : blobIdOrRecord;
    if (!blob) {
      throw new Error(`Blob ${blobIdOrRecord} not found`);
    }
    return this.sync.uploadBlob(blob, false);
  }

  fullDownload(peerId?: string, signal?: AbortSignal) {
    return this.sync.fullDownload(peerId, signal);
  }

  private waitForConnected(signal?: AbortSignal) {
    return this.storage.connection.waitForConnected(signal);
  }
}
