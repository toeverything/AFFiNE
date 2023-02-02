import { createStore, keys, setMany, getMany, clear } from 'idb-keyval';

type IDBInstance<T = ArrayBufferLike> = {
  keys: () => Promise<string[]>;
  clear: () => Promise<void>;
  setMany: (entries: [string, T][]) => Promise<void>;
  getMany: (keys: string[]) => Promise<T[]>;
};

export function getDatabase<T = ArrayBufferLike>(
  type: string,
  database: string
): IDBInstance<T> {
  const name = `${database}_${type}`;
  const db = createStore(name, type);
  return {
    keys: () => keys(db),
    clear: () => clear(db),
    setMany: entries => setMany(entries, db),
    getMany: keys => getMany(keys, db),
  };
}
