import { merge } from 'lodash-es';

import { HookAdapter } from '../mixins';
import type { Key, TableAdapter, TableOptions } from '../types';

@HookAdapter()
export class MemoryTableAdapter implements TableAdapter {
  data = new Map<Key, any>();
  subscriptions = new Map<Key, Array<(data: any) => void>>();

  constructor(private readonly tableName: string) {}

  setup(_opts: TableOptions) {}
  dispose() {}

  create(key: Key, data: any) {
    if (this.data.has(key)) {
      throw new Error(
        `Record with key ${key} already exists in table ${this.tableName}`
      );
    }

    this.data.set(key, data);
    this.dispatch(key, data);
    this.dispatch('$$KEYS', this.keys());
    return data;
  }

  get(key: Key) {
    return this.data.get(key) || null;
  }

  subscribe(key: Key, callback: (data: any) => void): () => void {
    const sKey = key.toString();
    let subs = this.subscriptions.get(sKey.toString());

    if (!subs) {
      subs = [];
      this.subscriptions.set(sKey, subs);
    }

    subs.push(callback);
    callback(this.data.get(key) || null);

    return () => {
      this.subscriptions.set(
        sKey,
        subs.filter(s => s !== callback)
      );
    };
  }

  keys(): Key[] {
    return Array.from(this.data.keys());
  }

  subscribeKeys(callback: (keys: Key[]) => void): () => void {
    const sKey = `$$KEYS`;
    let subs = this.subscriptions.get(sKey);

    if (!subs) {
      subs = [];
      this.subscriptions.set(sKey, subs);
    }
    subs.push(callback);
    callback(this.keys());

    return () => {
      this.subscriptions.set(
        sKey,
        subs.filter(s => s !== callback)
      );
    };
  }

  update(key: Key, data: any) {
    let record = this.data.get(key);

    if (!record) {
      throw new Error(
        `Record with key ${key} does not exist in table ${this.tableName}`
      );
    }

    record = merge({}, record, data);
    this.data.set(key, record);
    this.dispatch(key, record);
    return record;
  }

  delete(key: Key) {
    this.data.delete(key);
    this.dispatch(key, null);
    this.dispatch('$$KEYS', this.keys());
  }

  dispatch(key: Key, data: any) {
    this.subscriptions.get(key)?.forEach(callback => callback(data));
  }
}
