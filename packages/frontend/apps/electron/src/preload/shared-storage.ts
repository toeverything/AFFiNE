import { MemoryMemento } from '@toeverything/infra';
import { ipcRenderer } from 'electron';

import {
  AFFINE_API_CHANNEL_NAME,
  AFFINE_EVENT_CHANNEL_NAME,
} from '../shared/type';

// Load persisted data from main process synchronously at preload time
const initialGlobalState = ipcRenderer.sendSync(
  AFFINE_API_CHANNEL_NAME,
  'sharedStorage:getAllGlobalState'
);
const initialGlobalCache = ipcRenderer.sendSync(
  AFFINE_API_CHANNEL_NAME,
  'sharedStorage:getAllGlobalCache'
);

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
  memory.setAll(init);
  ipcRenderer.on(AFFINE_EVENT_CHANNEL_NAME, (_event, channel, updates) => {
    if (channel === `sharedStorage:${event}`) {
      for (const [key, raw] of Object.entries(updates)) {
        // support both legacy plain value and new { v, r, s } structure
        let value: any;
        let source: string | undefined;

        if (raw && typeof raw === 'object' && 'v' in raw) {
          value = (raw as any).v;
          source = (raw as any).s;
        } else {
          value = raw;
        }

        // Ignore our own broadcasts
        if (source && source === CLIENT_ID) {
          continue;
        }

        if (value === undefined) {
          memory.del(key);
        } else {
          memory.set(key, value);
        }
      }
    }
  });

  return {
    del(key: string) {
      memory.del(key);
      invokeWithCatch(`sharedStorage:${api.del}`, key, CLIENT_ID);
    },
    clear() {
      memory.clear();
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

export const globalState = createSharedStorageApi(
  initialGlobalState,
  'onGlobalStateChanged',
  {
    clear: 'clearGlobalState',
    del: 'delGlobalState',
    set: 'setGlobalState',
  }
);

export const globalCache = createSharedStorageApi(
  initialGlobalCache,
  'onGlobalCacheChanged',
  {
    clear: 'clearGlobalCache',
    del: 'delGlobalCache',
    set: 'setGlobalCache',
  }
);

export const sharedStorage = {
  globalState,
  globalCache,
};

export type SharedStorage = typeof sharedStorage;
