import EventEmitter2 from 'eventemitter2';

import { type Locker } from '../../storage/lock';
import type { IDBConnection } from './db';

interface ChannelMessage {
  type: 'unlock';
  key: string;
}

export class IndexedDBLocker implements Locker {
  get db() {
    return this.dbConnection.inner.db;
  }
  private readonly eventEmitter = new EventEmitter2();

  get channel() {
    return this.dbConnection.inner.channel;
  }

  constructor(private readonly dbConnection: IDBConnection) {}

  async lock(domain: string, resource: string) {
    const key = `${domain}:${resource}`;

    // oxlint-disable-next-line no-constant-condition
    while (true) {
      const trx = this.db.transaction('locks', 'readwrite');
      const record = await trx.store.get(key);
      const lockTimestamp = record?.lock.getTime();

      if (
        lockTimestamp &&
        lockTimestamp > Date.now() - 30000 /* lock timeout 3s */
      ) {
        trx.commit();

        await new Promise<void>(resolve => {
          const cleanup = () => {
            this.channel.removeEventListener('message', channelListener);
            this.eventEmitter.off('unlock', eventListener);
            clearTimeout(timer);
          };
          const channelListener = (event: MessageEvent<ChannelMessage>) => {
            if (event.data.type === 'unlock' && event.data.key === key) {
              cleanup();
              resolve();
            }
          };
          const eventListener = (unlockKey: string) => {
            if (unlockKey === key) {
              cleanup();
              resolve();
            }
          };
          this.channel.addEventListener('message', channelListener); // add listener
          this.eventEmitter.on('unlock', eventListener);

          const timer = setTimeout(() => {
            cleanup();
            resolve();
          }, 3000);
          // timeout to avoid dead lock
        });
        continue;
      } else {
        await trx.store.put({ key, lock: new Date() });
        trx.commit();
        break;
      }
    }

    return {
      [Symbol.asyncDispose]: async () => {
        const trx = this.db.transaction('locks', 'readwrite');
        await trx.store.delete(key);
        trx.commit();
        this.channel.postMessage({ type: 'unlock', key });
        this.eventEmitter.emit('unlock', key);
      },
    };
  }
}
