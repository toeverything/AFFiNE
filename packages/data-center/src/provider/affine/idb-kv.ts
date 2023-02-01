import { createStore, keys, setMany, getMany } from 'idb-keyval';
import * as idb from 'lib0/indexeddb.js';

type IDBInstance<T = ArrayBufferLike> = {
  keys: () => Promise<string[]>;
  deleteDB: () => Promise<void>;
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
    deleteDB: () => idb.deleteDB(name),
    setMany: entries => setMany(entries, db),
    getMany: keys => getMany(keys, db),
  };
}
