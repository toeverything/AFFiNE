import { DebugLogger } from '@affine/debug';
import { Slot } from '@blocksuite/affine/global/utils';
import { difference } from 'lodash-es';

import { LiveData } from '../../livedata';
import type { Memento } from '../../storage';
import { MANUALLY_STOP } from '../../utils';
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
  readonly name = 'blob-engine';
  readonly readonly = this.local.readonly;

  private abort: AbortController | null = null;

  readonly isStorageOverCapacity$ = new LiveData(false);

  singleBlobSizeLimit: number = 100 * 1024 * 1024;
  onAbortLargeBlob = new Slot<Blob>();

  constructor(
    private readonly local: BlobStorage,
    private readonly remotes: BlobStorage[]
  ) {}

  start() {
    if (this.abort || this.isStorageOverCapacity$.value) {
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
    this.abort?.abort(MANUALLY_STOP);
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
            this.isStorageOverCapacity$.value = true;
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

export const EmptyBlobStorage: BlobStorage = {
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
};

export class MemoryBlobStorage implements BlobStorage {
  name = 'testing';
  readonly = false;

  constructor(private readonly state: Memento) {}

  get(key: string) {
    return Promise.resolve(this.state.get<Blob>(key) ?? null);
  }
  set(key: string, value: Blob) {
    this.state.set(key, value);

    const list = this.state.get<Set<string>>('list') ?? new Set<string>();
    list.add(key);
    this.state.set('list', list);

    return Promise.resolve(key);
  }
  delete(key: string) {
    this.state.set(key, null);

    const list = this.state.get<Set<string>>('list') ?? new Set<string>();
    list.delete(key);
    this.state.set('list', list);

    return Promise.resolve();
  }
  list() {
    const list = this.state.get<Set<string>>('list');
    return Promise.resolve(list ? Array.from(list) : []);
  }
}
