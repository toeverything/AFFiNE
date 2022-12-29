import { createStore, del, get, keys, set } from 'idb-keyval';

export type ConfigStore<T = any> = {
  get: (key: string) => Promise<T | undefined>;
  set: (key: string, value: T) => Promise<void>;
  keys: () => Promise<string[]>;
  delete: (key: string) => Promise<void>;
};

const initialIndexedDB = <T = any>(database: string): ConfigStore<T> => {
  const store = createStore(`affine:${database}`, 'database');
  return {
    get: (key: string) => get<T>(key, store),
    set: (key: string, value: T) => set(key, value, store),
    keys: () => keys(store),
    delete: (key: string) => del(key, store),
  };
};

const scopedIndexedDB = () => {
  const idb = initialIndexedDB('global');
  const storeCache = new Map<string, Readonly<ConfigStore>>();

  return <T = any>(scope: string): Readonly<ConfigStore<T>> => {
    if (!storeCache.has(scope)) {
      const store = {
        get: (key: string) => idb.get(`${scope}:${key}`),
        set: (key: string, value: T) => idb.set(`${scope}:${key}`, value),
        keys: () =>
          idb
            .keys()
            .then(keys =>
              keys
                .filter(k => k.startsWith(`${scope}:`))
                .map(k => k.replace(`${scope}:`, ''))
            ),
        delete: (key: string) => del(`${scope}:${key}`),
      };

      storeCache.set(scope, store);
    }

    return storeCache.get(scope) as ConfigStore<T>;
  };
};

let lazyKVConfigure: ReturnType<typeof scopedIndexedDB> | undefined = undefined;

export const getKVConfigure = (scope: string) => {
  if (!lazyKVConfigure) {
    lazyKVConfigure = scopedIndexedDB();
  }
  return lazyKVConfigure(scope);
};
