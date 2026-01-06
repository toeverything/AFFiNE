import { MemoryMemento } from '@toeverything/infra';
import { ipcRenderer } from 'electron';

import {
  AFFINE_API_CHANNEL_NAME,
  AFFINE_EVENT_CHANNEL_NAME,
} from '../shared/type';

// Unique id for this renderer instance, used to ignore self-originated broadcasts
const CLIENT_ID: string = Math.random().toString(36).slice(2);

function invokeWithCatch(key: string, ...args: any[]) {
  ipcRenderer.invoke(AFFINE_API_CHANNEL_NAME, key, ...args).catch(err => {
    console.error(`Failed to invoke ${key}`, err);
  });
}

function createSharedStorageApi(
  init: Record<string, any>,
  event: string,
  api: {
    del: string;
    clear: string;
    set: string;
  }
) {
  const memory = new MemoryMemento();
  const revisions = new Map<string, number>();
  const updateQueue: Record<string, any>[] = [];
  let loaded = false;

  const applyUpdates = (updates: Record<string, any>) => {
    for (const [key, raw] of Object.entries(updates)) {
      // '*' means "reset everything" coming from a clear operation
      if (key === '*') {
        memory.clear();
        revisions.clear();
        continue;
      }

      // support both legacy plain value and new { v, r, s } structure
      let value: any;
      let source: string | undefined;
      let rev: number | undefined;

      if (raw && typeof raw === 'object' && 'v' in raw) {
        value = raw.v;
        source = raw.s;
        rev = typeof raw.r === 'number' ? raw.r : undefined;
      } else {
        value = raw;
      }

      // Ignore our own broadcasts
      if (source && source === CLIENT_ID) {
        continue;
      }

      if (rev !== undefined) {
        const current = revisions.get(key) ?? -1;
        if (rev <= current) {
          continue;
        }
        revisions.set(key, rev);
      }

      if (value === undefined) {
        memory.del(key);
      } else {
        memory.set(key, value);
      }
    }
  };

  ipcRenderer.on(AFFINE_EVENT_CHANNEL_NAME, (_event, channel, updates) => {
    if (channel === `sharedStorage:${event}`) {
      if (loaded) {
        applyUpdates(updates);
      } else {
        updateQueue.push(updates);
      }
    }
  });

  const initPromise = (async () => {
    try {
      memory.setAll(init);
      const latest = await ipcRenderer.invoke(
        AFFINE_API_CHANNEL_NAME,
        event === 'onGlobalStateChanged'
          ? 'sharedStorage:getAllGlobalState'
          : 'sharedStorage:getAllGlobalCache'
      );
      if (latest && typeof latest === 'object') {
        memory.setAll(latest);
      }
    } catch (err) {
      console.error('Failed to load initial shared storage', err);
    } finally {
      loaded = true;
      while (updateQueue.length) {
        const updates = updateQueue.shift();
        if (updates) {
          applyUpdates(updates);
        }
      }
    }
  })();

  return {
    ready: initPromise,
    del(key: string) {
      memory.del(key);
      invokeWithCatch(`sharedStorage:${api.del}`, key, CLIENT_ID);
    },
    clear() {
      memory.clear();
      revisions.clear();
      invokeWithCatch(`sharedStorage:${api.clear}`, CLIENT_ID);
    },
    get<T>(key: string): T | undefined {
      return memory.get(key);
    },
    keys() {
      return memory.keys();
    },
    set(key: string, value: unknown) {
      memory.set(key, value);
      invokeWithCatch(`sharedStorage:${api.set}`, key, value, CLIENT_ID);
    },
    watch<T>(key: string, cb: (i: T | undefined) => void): () => void {
      const subscription = memory.watch(key).subscribe(i => cb(i as T));
      return () => subscription.unsubscribe();
    },
  };
}

export const globalState = createSharedStorageApi({}, 'onGlobalStateChanged', {
  clear: 'clearGlobalState',
  del: 'delGlobalState',
  set: 'setGlobalState',
});

export const globalCache = createSharedStorageApi({}, 'onGlobalCacheChanged', {
  clear: 'clearGlobalCache',
  del: 'delGlobalCache',
  set: 'setGlobalCache',
});

export const sharedStorage = {
  globalState,
  globalCache,
};

export type SharedStorage = typeof sharedStorage;
