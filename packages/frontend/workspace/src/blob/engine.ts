import { DebugLogger } from '@affine/debug';
import { difference } from 'lodash-es';

const logger = new DebugLogger('affine:blob-engine');

export class BlobEngine {
  constructor(
    private readonly local: BlobStorage,
    private readonly remotes: BlobStorage[]
  ) {}

  get storages() {
    return [this.local, ...this.remotes];
  }

  async sync() {
    if (this.local.readonly) {
      return;
    }
    logger.debug('start syncing blob...');
    for (const remote of this.remotes) {
      let localList;
      let remoteList;
      try {
        localList = await this.local.list();
        remoteList = await remote.list();
      } catch (err) {
        logger.error(`error when sync`, err);
        continue;
      }

      if (!remote.readonly) {
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
    return undefined;
  }

  async set(key: string, value: Blob) {
    if (this.local.readonly) {
      throw new Error('local peer is readonly');
    }

    // await upload to the local peer
    await this.local.set(key, value);

    // uploads to other peers in the background
    Promise.allSettled(
      this.remotes
        .filter(r => !r.readonly)
        .map(peer =>
          peer.set(key, value).catch(err => {
            logger.error('error when upload to peer', err);
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

export interface BlobStorage {
  name: string;
  readonly: boolean;
  get: (key: string) => Promise<Blob | undefined>;
  set: (key: string, value: Blob) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<string[]>;
}
