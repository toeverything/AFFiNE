import {
  createStore,
  del,
  get,
  keys,
  set,
  setMany,
  clear,
  entries,
} from 'idb-keyval';

export type ConfigStore<T = any> = {
  get: (key: string) => Promise<T | undefined>;
  set: (key: string, value: T) => Promise<void>;
  setMany: (values: [string, T][]) => Promise<void>;
  keys: () => Promise<string[]>;
  entries: () => Promise<[string, T][]>;
  delete: (key: string) => Promise<void>;
  clear: () => Promise<void>;
};

const initialIndexedDB = <T = any>(database: string): ConfigStore<T> => {
  const store = createStore(`affine:${database}`, 'database');
  return {
    get: (key: string) => get<T>(key, store),
    set: (key: string, value: T) => set(key, value, store),
    setMany: (values: [string, T][]) => setMany(values, store),
    keys: () => keys(store),
    entries: () => entries(store),
    delete: (key: string) => del(key, store),
    clear: () => clear(store),
  };
};

const scopedIndexedDB = () => {
  const idb = initialIndexedDB('global');
  const storeCache = new Map<string, Readonly<ConfigStore>>();

  return <T = any>(scope: string): Readonly<ConfigStore<T>> => {
    if (!storeCache.has(scope)) {
      const prefix = `${scope}:`;
      const store = {
        get: async (key: string) => idb.get(prefix + key),
        set: (key: string, value: T) => idb.set(prefix + key, value),
        setMany: (values: [string, T][]) =>
          idb.setMany(values.map(([k, v]) => [`${scope}:${k}`, v])),
        keys: () =>
          idb
            .keys()
            .then(keys =>
              keys
                .filter(k => k.startsWith(prefix))
                .map(k => k.slice(prefix.length))
            ),
        entries: () =>
          idb
            .entries()
            .then(entries =>
              entries
                .filter(([k]) => k.startsWith(prefix))
                .map(([k, v]) => [k.slice(prefix.length), v] as [string, T])
            ),
        delete: (key: string) => idb.delete(prefix + key),
        clear: async () => {
          await idb
            .keys()
            .then(keys =>
              Promise.all(
                keys.filter(k => k.startsWith(prefix)).map(k => del(k))
              )
            );
        },
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
