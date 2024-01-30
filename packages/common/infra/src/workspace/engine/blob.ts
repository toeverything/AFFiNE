import { DebugLogger } from '@affine/debug';
import { Slot } from '@blocksuite/global/utils';
import { difference } from 'lodash-es';

import { createIdentifier } from '../../di';
import { BlobStorageOverCapacity } from './error';

const logger = new DebugLogger('affine:blob-engine');

export interface BlobStorage {
  name: string;
  readonly: boolean;
  get: (key: string) => Promise<Blob | null>;
  set: (key: string, value: Blob) => Promise<string>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<string[]>;
}

export const LocalBlobStorage =
  createIdentifier<BlobStorage>('LocalBlobStorage');

export const RemoteBlobStorage =
  createIdentifier<BlobStorage>('RemoteBlobStorage');

export interface BlobStatus {
  isStorageOverCapacity: boolean;
}

/**
 * # BlobEngine
 *
 * sync blobs between storages in background.
 *
 * all operations priority use local, then use remote.
 */
export class BlobEngine {
  private abort: AbortController | null = null;
  private _status: BlobStatus = { isStorageOverCapacity: false };
  onStatusChange = new Slot<BlobStatus>();
  singleBlobSizeLimit: number = 100 * 1024 * 1024;
  onAbortLargeBlob = new Slot<Blob>();

  private set status(s: BlobStatus) {
    logger.debug('status change', s);
    this._status = s;
    this.onStatusChange.emit(s);
  }
  get status() {
    return this._status;
  }

  constructor(
    private readonly local: BlobStorage,
    private readonly remotes: BlobStorage[]
  ) {}

  static get EMPTY() {
    return new BlobEngine(createEmptyBlobStorage(), []);
  }

  start() {
    if (this.abort || this._status.isStorageOverCapacity) {
      return;
    }
    this.abort = new AbortController();
    const abortSignal = this.abort.signal;

    const sync = () => {
      if (abortSignal.aborted) {
        return;
      }

      this.sync()
        .catch(error => {
          logger.error('sync blob error', error);
        })
        .finally(() => {
          // sync every 1 minute
          setTimeout(sync, 60000);
        });
    };

    sync();
  }

  stop() {
    this.abort?.abort();
    this.abort = null;
  }

  get storages() {
    return [this.local, ...this.remotes];
  }

  async sync() {
    if (this.local.readonly) {
      return;
    }
    logger.debug('start syncing blob...');
    for (const remote of this.remotes) {
      let localList: string[] = [];
      let remoteList: string[] = [];

      if (!remote.readonly) {
        try {
          localList = await this.local.list();
          remoteList = await remote.list();
        } catch (err) {
          logger.error(`error when sync`, err);
          continue;
        }

        const needUpload = difference(localList, remoteList);
        for (const key of needUpload) {
          try {
            const data = await this.local.get(key);
            if (data) {
              await remote.set(key, data);
            }
          } catch (err) {
            logger.error(
              `error when sync ${key} from [${this.local.name}] to [${remote.name}]`,
              err
            );
          }
        }
      }

      const needDownload = difference(remoteList, localList);

      for (const key of needDownload) {
        try {
          const data = await remote.get(key);
          if (data) {
            await this.local.set(key, data);
          }
        } catch (err) {
          if (err instanceof BlobStorageOverCapacity) {
            this.status = {
              isStorageOverCapacity: true,
            };
          }
          logger.error(
            `error when sync ${key} from [${remote.name}] to [${this.local.name}]`,
            err
          );
        }
      }
    }

    logger.debug('finish syncing blob');
  }

  async get(key: string) {
    logger.debug('get blob', key);
    for (const storage of this.storages) {
      const data = await storage.get(key);
      if (data) {
        return data;
      }
    }
    return null;
  }

  async set(key: string, value: Blob) {
    if (this.local.readonly) {
      throw new Error('local peer is readonly');
    }

    if (value.size > this.singleBlobSizeLimit) {
      this.onAbortLargeBlob.emit(value);
      logger.error('blob over limit, abort set');
      return key;
    }

    // await upload to the local peer
    await this.local.set(key, value);

    // uploads to other peers in the background
    Promise.allSettled(
      this.remotes
        .filter(r => !r.readonly)
        .map(peer =>
          peer.set(key, value).catch(err => {
            logger.error('Error when uploading to peer', err);
          })
        )
    )
      .then(result => {
        if (result.some(({ status }) => status === 'rejected')) {
          logger.error(
            `blob ${key} update finish, but some peers failed to update`
          );
        } else {
          logger.debug(`blob ${key} update finish`);
        }
      })
      .catch(() => {
        // Promise.allSettled never reject
      });

    return key;
  }

  async delete(_key: string) {
    // not supported
  }

  async list() {
    const blobList = new Set<string>();

    for (const peer of this.storages) {
      const list = await peer.list();
      if (list) {
        for (const blob of list) {
          blobList.add(blob);
        }
      }
    }

    return Array.from(blobList);
  }
}

export function createEmptyBlobStorage() {
  return {
    name: 'empty',
    readonly: true,
    async get(_key: string) {
      return null;
    },
    async set(_key: string, _value: Blob) {
      throw new Error('not supported');
    },
    async delete(_key: string) {
      throw new Error('not supported');
    },
    async list() {
      return [];
    },
  } satisfies BlobStorage;
}
