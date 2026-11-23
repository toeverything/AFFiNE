import { type Logger, sha } from '@blocksuite/global/utils';

import type { BlobSource } from './source.js';

export interface BlobStatus {
  isStorageOverCapacity: boolean;
}

/**
 * # BlobEngine
 *
 * sync blobs between storages in background.
 *
 * all operations priority use main, then use shadows.
 */
export class BlobEngine {
  private _abort: AbortController | null = null;

  get sources() {
    return [this.main, ...this.shadows];
  }

  constructor(
    readonly main: BlobSource,
    readonly shadows: BlobSource[],
    readonly logger: Logger
  ) {}

  async delete(_key: string) {
    this.logger.error(
      'You are trying to delete a blob. We do not support this feature yet. We need to wait until we implement the indexer, which will inform us which doc is using a particular blob so that we can safely delete it.'
    );
  }

  async get(key: string) {
    this.logger.debug('get blob', key);
    for (const source of this.sources) {
      const data = await source.get(key);
      if (data) {
        return data;
      }
    }
    return null;
  }

  async list() {
    const blobIdSet = new Set<string>();

    for (const source of this.sources) {
      const blobs = await source.list();
      for (const blob of blobs) {
        blobIdSet.add(blob);
      }
    }

    return Array.from(blobIdSet);
  }

  async set(value: Blob): Promise<string>;

  async set(key: string, value: Blob): Promise<string>;

  async set(valueOrKey: string | Blob, _value?: Blob) {
    if (this.main.readonly) {
      throw new Error('main peer is readonly');
    }

    const key =
      typeof valueOrKey === 'string'
        ? valueOrKey
        : await sha(await valueOrKey.arrayBuffer());
    const value = typeof valueOrKey === 'string' ? _value : valueOrKey;

    if (!value) {
      throw new Error('value is empty');
    }

    // await upload to the main peer
    await this.main.set(key, value);

    // uploads to other peers in the background
    Promise.allSettled(
      this.shadows
        .filter(r => !r.readonly)
        .map(peer =>
          peer.set(key, value).catch(err => {
            this.logger.error('Error when uploading to peer', err);
          })
        )
    )
      .then(result => {
        if (result.some(({ status }) => status === 'rejected')) {
          this.logger.error(
            `blob ${key} update finish, but some peers failed to update`
          );
        } else {
          this.logger.debug(`blob ${key} update finish`);
        }
      })
      .catch(() => {
        // Promise.allSettled never reject
      });

    return key;
  }

  blobState$(key: string) {
    return this.main.blobState$?.(key) ?? null;
  }

  upload(key: string) {
    return this.main.upload?.(key) ?? null;
  }

  start() {
    if (this._abort) {
      return;
    }
    this._abort = new AbortController();
    const abortSignal = this._abort.signal;

    const sync = () => {
      if (abortSignal.aborted) {
        return;
      }

      this.sync()
        .catch(error => {
          this.logger.error('sync blob error', error);
        })
        .finally(() => {
          // sync every 1 minute
          setTimeout(sync, 60000);
        });
    };

    sync();
  }

  stop() {
    this._abort?.abort();
    this._abort = null;
  }

  async sync() {
    if (this.main.readonly) {
      return;
    }
    this.logger.debug('start syncing blob...');
    for (const shadow of this.shadows) {
      let mainList: string[] = [];
      let shadowList: string[] = [];

      if (!shadow.readonly) {
        try {
          mainList = await this.main.list();
          shadowList = await shadow.list();
        } catch (err) {
          this.logger.error(`error when sync`, err);
          continue;
        }

        const needUpload = mainList.filter(key => !shadowList.includes(key));
        for (const key of needUpload) {
          try {
            const data = await this.main.get(key);
            if (data) {
              await shadow.set(key, data);
            } else {
              this.logger.error(
                'data not found when trying upload from main to shadow'
              );
            }
          } catch (err) {
            this.logger.error(
              `error when sync ${key} from [${this.main.name}] to [${shadow.name}]`,
              err
            );
          }
        }
      }

      const needDownload = shadowList.filter(key => !mainList.includes(key));
      for (const key of needDownload) {
        try {
          const data = await shadow.get(key);
          if (data) {
            await this.main.set(key, data);
          } else {
            this.logger.error(
              'data not found when trying download from shadow to main'
            );
          }
        } catch (err) {
          this.logger.error(
            `error when sync ${key} from [${shadow.name}] to [${this.main.name}]`,
            err
          );
        }
      }
    }

    this.logger.debug('finish syncing blob');
  }
}
