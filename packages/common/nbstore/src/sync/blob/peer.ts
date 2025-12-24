import { difference } from 'lodash-es';
import { filter, Observable, ReplaySubject, share, Subject } from 'rxjs';

import type { BlobRecord, BlobStorage } from '../../storage';
import { OverCapacityError, OverSizeError } from '../../storage';
import type { BlobSyncStorage } from '../../storage/blob-sync';
import { MANUALLY_STOP, throwIfAborted } from '../../utils/throw-if-aborted';

export interface BlobSyncPeerState {
  uploading: number;
  downloading: number;
  error: number;
  overCapacity: boolean;
}

export interface BlobSyncPeerBlobState {
  needUpload: boolean;
  needDownload: boolean;
  uploading: boolean;
  downloading: boolean;
  overSize: boolean;
  errorMessage?: string | null;
}

export class BlobSyncPeer {
  private readonly status = new BlobSyncPeerStatus();

  get peerState$() {
    return this.status.peerState$;
  }

  blobPeerState$(blobId: string) {
    return this.status.blobPeerState$(blobId);
  }

  constructor(
    readonly peerId: string,
    readonly local: BlobStorage,
    readonly remote: BlobStorage,
    readonly blobSync: BlobSyncStorage
  ) {}

  private readonly downloadingPromise = new Map<string, Promise<boolean>>();

  /**
   * Downloads a blob from the peer with exponential backoff retry logic
   * @param blobId - The ID of the blob to download
   * @param signal - Optional AbortSignal to cancel the download
   * @returns true if the blob is downloaded successfully, false if the blob is not found after retries
   *
   * @throws This method will throw an error if the download operation fails due to network issues or is aborted
   */
  downloadBlob(blobId: string, signal?: AbortSignal): Promise<boolean> {
    // if the blob is already downloading, return the existing promise
    const existing = this.downloadingPromise.get(blobId);
    if (existing) {
      return existing;
    }

    const backoffRetry = {
      delay: 1000,
      maxDelay: 10000,
      count: this.remote.isReadonly ? 1 : 5, // readonly remote storage will not retry
    };

    const promise = new Promise<boolean>((resolve, reject) => {
      this.status.markBlobToDownload(blobId);
      // mark the blob as downloading
      this.status.blobDownloading(blobId);

      let attempts = 0;

      const attempt = async () => {
        try {
          throwIfAborted(signal);
          const data = await this.remote.get(blobId, signal);
          throwIfAborted(signal);
          if (data) {
            // mark the blob as uploaded to avoid uploading the same blob again
            await this.blobSync.setBlobUploadedAt(
              this.peerId,
              blobId,
              new Date()
            );
            await this.local.set(data, signal);

            this.status.blobDownloadSuccess(blobId);
            resolve(true);
          } else {
            // if the blob is not found, maybe the uploader have't uploaded the blob yet, we will retry several times
            attempts++;
            if (attempts < backoffRetry.count) {
              const waitTime = Math.min(
                Math.pow(2, attempts - 1) * backoffRetry.delay,
                backoffRetry.maxDelay
              );
              // eslint-disable-next-line @typescript-eslint/no-misused-promises
              setTimeout(attempt, waitTime);
            } else {
              // reach the max retry times, resolve the promise with false
              resolve(false);
            }
          }
        } catch (error) {
          // if we encounter any error, reject without retry
          reject(error);
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      attempt();
    })
      .catch(error => {
        if (error === MANUALLY_STOP) {
          throw error;
        }
        this.status.blobError(
          blobId,
          error instanceof Error ? error.message : String(error)
        );
        throw error;
      })
      .finally(() => {
        this.status.blobDownloadFinish(blobId);
        this.downloadingPromise.delete(blobId);
      });

    this.downloadingPromise.set(blobId, promise);
    return promise;
  }

  uploadingPromise = new Map<string, Promise<true>>();

  /**
   * Upload a blob to the peer
   * @param blob - The blob to upload
   * @param force - Whether to force upload the blob, even if it has already been uploaded
   * @param signal - The abort signal
   * @returns The promise should always resolve to true when the upload is complete.
   *
   * @throws This method will throw an error if the upload is aborted or fails due to storage limitations.
   */
  async uploadBlob(
    blob: BlobRecord,
    force = false,
    signal?: AbortSignal
  ): Promise<true> {
    if (this.remote.isReadonly) {
      return true;
    }

    if (!force) {
      // if the blob has been uploaded, skip the upload
      const uploadedAt = await this.blobSync.getBlobUploadedAt(
        this.peerId,
        blob.key
      );
      if (uploadedAt) {
        return true;
      }
    }

    const existing = this.uploadingPromise.get(blob.key);
    if (existing) {
      return existing;
    }

    const promise = (async () => {
      this.status.markBlobToUpload(blob.key);
      // mark the blob as uploading
      this.status.blobUploading(blob.key);
      await this.blobSync.setBlobUploadedAt(this.peerId, blob.key, null);
      try {
        throwIfAborted(signal);
        await this.remote.set(blob, signal);
        await this.blobSync.setBlobUploadedAt(
          this.peerId,
          blob.key,
          new Date()
        );

        this.status.blobUploadSuccess(blob.key);

        // free the remote storage over capacity flag
        this.status.remoteOverCapacityFree();
        return true;
      } catch (err) {
        if (err === MANUALLY_STOP) {
          throw err;
        }
        if (err instanceof OverCapacityError) {
          // mark the remote storage as over capacity, this will stop the upload loop
          this.status.remoteOverCapacity();
          this.status.blobError(blob.key, 'Remote storage over capacity');
        } else if (err instanceof OverSizeError) {
          this.status.blobOverSizeWithError(blob.key, err.message);
        } else {
          this.status.blobError(
            blob.key,
            err instanceof Error ? err.message : String(err)
          );
        }
        throw err;
      } finally {
        this.status.blobUploadFinish(blob.key);
      }
    })().finally(() => {
      this.uploadingPromise.delete(blob.key);
    }) as Promise<true>;

    this.uploadingPromise.set(blob.key, promise);
    return promise;
  }

  async fullUploadLoop(signal?: AbortSignal) {
    while (true) {
      try {
        await this.fullUpload(signal);
      } catch (err) {
        if (signal?.aborted) {
          return;
        }
        // should never reach here
        console.warn('Blob full upload error, retry in 15s', err);
      }
      // wait for 15s before next loop
      await new Promise<void>(resolve => {
        setTimeout(resolve, 15000);
      });
      if (signal?.aborted) {
        return;
      }
    }
  }

  private async fullUpload(signal?: AbortSignal) {
    if (this.remote.isReadonly) {
      return;
    }

    // if the remote storage is over capacity, skip the upload loop
    if (this.status.overCapacity) {
      return;
    }

    await this.local.connection.waitForConnected(signal);
    await this.remote.connection.waitForConnected(signal);

    const localList = await this.local.list();

    const needUpload: string[] = [];
    for (const blob of localList) {
      const uploadedAt = await this.blobSync.getBlobUploadedAt(
        this.peerId,
        blob.key
      );
      if (uploadedAt === null) {
        needUpload.push(blob.key);
      } else {
        // if the blob has uploaded, we clear its states flags here.
        // this ensures that the sync status seen by the user is clean.
        this.status.blobStateClear(blob.key);
      }
    }

    if (needUpload.length === 0) {
      return;
    }

    // mark all blobs as will upload
    for (const blobKey of needUpload) {
      this.status.markBlobToUpload(blobKey);
      this.status.blobWillUpload(blobKey);
    }

    try {
      if (needUpload.length <= 3) {
        // if there is only few blobs to upload, upload them one by one

        // upload the blobs
        for (const blobKey of needUpload) {
          const data = await this.local.get(blobKey);
          throwIfAborted(signal);
          if (data) {
            try {
              await this.uploadBlob(data, false, signal);
            } catch (err) {
              if (err === MANUALLY_STOP) {
                throw err;
              }
              // ignore the error as it has already been recorded in the sync status
            }
          }
        }
      } else {
        // if there are many blobs to upload, call remote list to reduce unnecessary uploads
        const remoteList = new Set((await this.remote.list()).map(b => b.key));

        for (const blobKey of needUpload) {
          if (remoteList.has(blobKey)) {
            // if the blob is already uploaded, set the blob as uploaded
            await this.blobSync.setBlobUploadedAt(
              this.peerId,
              blobKey,
              new Date()
            );

            // mark the blob as uploaded
            this.status.blobUploadFinish(blobKey);
            continue;
          }

          // if the blob is over size, skip it
          if (this.status.overSize.has(blobKey)) {
            continue;
          }

          const data = await this.local.get(blobKey);
          throwIfAborted(signal);
          if (data) {
            try {
              await this.uploadBlob(data, false, signal);
            } catch (err) {
              if (err === MANUALLY_STOP) {
                throw err;
              }
              // ignore the error as it has already been recorded in the sync status
            }
          }
        }
      }
    } finally {
      // remove all will upload flags
      for (const blobKey of needUpload) {
        this.status.blobWillUploadFinish(blobKey);
      }
    }
  }

  async fullDownload(signal?: AbortSignal) {
    await this.local.connection.waitForConnected(signal);
    await this.remote.connection.waitForConnected(signal);

    const localList = (await this.local.list()).map(b => b.key);
    const remoteList = (await this.remote.list()).map(b => b.key);

    const needDownload = difference(remoteList, localList);

    // mark all blobs as will download
    for (const blobKey of needDownload) {
      this.status.markBlobToDownload(blobKey);
      this.status.blobWillDownload(blobKey);
    }

    try {
      for (const blobKey of needDownload) {
        throwIfAborted(signal);
        // download the blobs
        try {
          await this.downloadBlob(blobKey, signal);
        } catch (err) {
          if (err === MANUALLY_STOP) {
            throw err;
          }
          // ignore the error as it has already been recorded in the sync status
        }
      }
    } finally {
      // remove all will download flags
      for (const blobKey of needDownload) {
        this.status.blobWillDownloadFinish(blobKey);
      }
    }
  }

  async markBlobUploaded(blobKey: string): Promise<void> {
    await this.blobSync.setBlobUploadedAt(this.peerId, blobKey, new Date());
  }
}

class BlobSyncPeerStatus {
  overCapacity = false;

  // blobs that need to be uploaded or downloaded
  toUpload = new Set<string>();
  toDownload = new Set<string>();

  willUpload = new Set<string>();
  uploading = new Set<string>();
  downloading = new Set<string>();
  willDownload = new Set<string>();
  error = new Map<string, string>();
  overSize = new Set<string>();

  peerState$ = new Observable<BlobSyncPeerState>(subscribe => {
    const next = () => {
      subscribe.next({
        uploading: this.willUpload.union(this.uploading).size,
        downloading: this.willDownload.union(this.downloading).size,
        error: this.error.size,
        overCapacity: this.overCapacity,
      });
    };
    next();
    const dispose = this.statusUpdatedSubject$.subscribe(() => {
      next();
    });
    return () => {
      dispose.unsubscribe();
    };
  }).pipe(
    share({
      connector: () => new ReplaySubject(1),
    })
  );

  blobPeerState$(blobId: string) {
    return new Observable<BlobSyncPeerBlobState>(subscribe => {
      const next = () => {
        subscribe.next({
          needUpload: this.toUpload.has(blobId),
          needDownload: this.toDownload.has(blobId),
          uploading: this.willUpload.has(blobId) || this.uploading.has(blobId),
          downloading:
            this.willDownload.has(blobId) || this.downloading.has(blobId),
          errorMessage: this.error.get(blobId) ?? null,
          overSize: this.overSize.has(blobId),
        });
      };
      next();
      const dispose = this.statusUpdatedSubject$
        .pipe(
          filter(
            updatedBlobId => updatedBlobId === blobId || updatedBlobId === true
          )
        )
        .subscribe(() => next());
      return () => {
        dispose.unsubscribe();
      };
    }).pipe(
      share({
        connector: () => new ReplaySubject(1),
      })
    );
  }

  private readonly statusUpdatedSubject$ = new Subject<string | true>();

  markBlobToUpload(blobId: string) {
    if (!this.toUpload.has(blobId)) {
      this.toUpload.add(blobId);
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  markBlobToDownload(blobId: string) {
    if (!this.toDownload.has(blobId)) {
      this.toDownload.add(blobId);
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobUploading(blobId: string) {
    if (!this.uploading.has(blobId)) {
      this.uploading.add(blobId);
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobUploadSuccess(blobId: string) {
    this.blobUploadFinish(blobId);
    this.blobErrorFree(blobId);
    const deleted = this.toUpload.delete(blobId);
    if (deleted) {
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobUploadFinish(blobId: string) {
    let deleted = false;
    deleted = this.uploading.delete(blobId) || deleted;
    deleted = this.willUpload.delete(blobId) || deleted;
    if (deleted) {
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobWillUpload(blobId: string) {
    if (!this.willUpload.has(blobId)) {
      this.willUpload.add(blobId);
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobWillUploadFinish(blobId: string) {
    const deleted = this.willUpload.delete(blobId);
    if (deleted) {
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobDownloading(blobId: string) {
    if (!this.downloading.has(blobId)) {
      this.downloading.add(blobId);
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobDownloadSuccess(blobId: string) {
    this.blobDownloadFinish(blobId);
    this.blobErrorFree(blobId);
    const deleted = this.toDownload.delete(blobId);
    if (deleted) {
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobDownloadFinish(blobId: string) {
    let deleted = false;
    deleted = this.willDownload.delete(blobId) || deleted;
    deleted = this.downloading.delete(blobId) || deleted;
    if (deleted) {
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobWillDownload(blobId: string) {
    if (!this.willDownload.has(blobId)) {
      this.willDownload.add(blobId);
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobWillDownloadFinish(blobId: string) {
    const deleted = this.willDownload.delete(blobId);
    if (deleted) {
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobError(blobId: string, errorMessage: string) {
    this.error.set(blobId, errorMessage);
    this.statusUpdatedSubject$.next(blobId);
  }

  remoteOverCapacity() {
    if (!this.overCapacity) {
      this.overCapacity = true;
      this.statusUpdatedSubject$.next(true);
    }
  }

  remoteOverCapacityFree() {
    if (this.overCapacity) {
      this.overCapacity = false;
      this.statusUpdatedSubject$.next(true);
    }
  }

  blobOverSize(blobId: string) {
    this.overSize.add(blobId);
    this.statusUpdatedSubject$.next(blobId);
  }

  blobOverSizeWithError(blobId: string, errorMessage: string) {
    this.overSize.add(blobId);
    this.error.set(blobId, errorMessage);
    this.statusUpdatedSubject$.next(blobId);
  }

  blobErrorFree(blobId: string) {
    let deleted = false;
    deleted = this.error.delete(blobId) || deleted;
    deleted = this.overSize.delete(blobId) || deleted;
    if (deleted) {
      this.statusUpdatedSubject$.next(blobId);
    }
  }

  blobStateClear(blobId: string) {
    let deleted = false;
    deleted = this.toUpload.delete(blobId) || deleted;
    deleted = this.toDownload.delete(blobId) || deleted;
    deleted = this.willUpload.delete(blobId) || deleted;
    deleted = this.willDownload.delete(blobId) || deleted;
    deleted = this.uploading.delete(blobId) || deleted;
    deleted = this.downloading.delete(blobId) || deleted;
    deleted = this.error.delete(blobId) || deleted;
    deleted = this.overSize.delete(blobId) || deleted;
    if (deleted) {
      this.statusUpdatedSubject$.next(blobId);
    }
  }
}
