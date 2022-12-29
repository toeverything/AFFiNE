import { createStore, del, get, keys, set } from 'idb-keyval';

export type IdbInstance<T = any> = {
  get: (key: string) => Promise<T | undefined>;
  set: (key: string, value: T) => Promise<void>;
  keys: () => Promise<string[]>;
  delete: (key: string) => Promise<void>;
};

const initialIndexedDB = <T = any>(database: string): IdbInstance<T> => {
  const store = createStore(`affine:${database}`, 'database');
  return {
    get: (key: string) => get<T>(key, store),
    set: (key: string, value: T) => set(key, value, store),
    keys: () => keys(store),
    delete: (key: string) => del(key, store),
  };
};

const globalIndexedDB = () => {
  const idb = initialIndexedDB('global');

  return <T = any>(scope: string): IdbInstance<T> => ({
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
  });
};

export const getKVConfigure = globalIndexedDB();
