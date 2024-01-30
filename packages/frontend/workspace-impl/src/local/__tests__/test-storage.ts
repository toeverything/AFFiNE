import type { SyncStorage } from '@toeverything/infra';

export function createTestStorage(origin: SyncStorage) {
  const controler = {
    pausedPull: Promise.resolve(),
    resumePull: () => {},
    pausedPush: Promise.resolve(),
    resumePush: () => {},
  };

  return {
    name: `${origin.name}(testing)`,
    pull(docId: string, state: Uint8Array) {
      return controler.pausedPull.then(() => origin.pull(docId, state));
    },
    push(docId: string, data: Uint8Array) {
      return controler.pausedPush.then(() => origin.push(docId, data));
    },
    subscribe(
      cb: (docId: string, data: Uint8Array) => void,
      disconnect: (reason: string) => void
    ) {
      return origin.subscribe(cb, disconnect);
    },
    pausePull() {
      controler.pausedPull = new Promise(resolve => {
        controler.resumePull = resolve;
      });
    },
    resumePull() {
      controler.resumePull?.();
    },
    pausePush() {
      controler.pausedPush = new Promise(resolve => {
        controler.resumePush = resolve;
      });
    },
    resumePush() {
      controler.resumePush?.();
    },
  };
}
