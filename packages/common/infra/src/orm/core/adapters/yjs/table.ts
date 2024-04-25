import { omit } from 'lodash-es';
import type { Doc, Map as YMap, Transaction, YMapEvent } from 'yjs';

import { validators } from '../../validators';
import { HookAdapter } from '../mixins';
import type { Key, TableAdapter, TableOptions } from '../types';

/**
 * Yjs Adapter for AFFiNE ORM
 *
 * Structure:
 *
 * Each table is a YDoc instance
 *
 * Table(YDoc)
 *   Key(string): Row(YMap)({
 *     FieldA(string): Value(Primitive)
 *     FieldB(string): Value(Primitive)
 *     FieldC(string): Value(Primitive)
 *   })
 */
@HookAdapter()
export class YjsTableAdapter implements TableAdapter {
  private readonly deleteFlagKey = '$$DELETED';
  private readonly keyFlagKey = '$$KEY';
  private readonly hiddenFields = [this.deleteFlagKey, this.keyFlagKey];

  private readonly origin = 'YjsTableAdapter';

  keysCache: Set<Key> | null = null;
  cacheStaled = true;

  constructor(
    private readonly tableName: string,
    private readonly doc: Doc
  ) {}

  setup(_opts: TableOptions): void {
    this.doc.on('update', (_, origin) => {
      if (origin !== this.origin) {
        this.markCacheStaled();
      }
    });
  }

  dispose() {
    this.doc.destroy();
  }

  create(key: Key, data: any) {
    validators.validateYjsEntityData(this.tableName, data);
    const record = this.doc.getMap(key.toString());

    this.doc.transact(() => {
      for (const key in data) {
        record.set(key, data[key]);
      }

      this.keyBy(record, key);
    }, this.origin);

    this.markCacheStaled();
    return this.value(record);
  }

  update(key: Key, data: any) {
    validators.validateYjsEntityData(this.tableName, data);
    const record = this.record(key);

    if (this.isDeleted(record)) {
      return;
    }

    this.doc.transact(() => {
      for (const key in data) {
        record.set(key, data[key]);
      }
    }, this.origin);

    return this.value(record);
  }

  get(key: Key) {
    const record = this.record(key);
    return this.value(record);
  }

  subscribe(key: Key, callback: (data: any) => void) {
    const record: YMap<any> = this.record(key);
    // init callback
    callback(this.value(record));

    const ob = (event: YMapEvent<any>) => {
      callback(this.value(event.target));
    };
    record.observe(ob);

    return () => {
      record.unobserve(ob);
    };
  }

  keys() {
    const keysCache = this.buildKeysCache();
    return Array.from(keysCache);
  }

  subscribeKeys(callback: (keys: Key[]) => void) {
    const keysCache = this.buildKeysCache();
    // init callback
    callback(Array.from(keysCache));

    const ob = (tx: Transaction) => {
      const keysCache = this.buildKeysCache();

      for (const [type] of tx.changed) {
        const data = type as unknown as YMap<any>;
        const key = this.keyof(data);
        if (this.isDeleted(data)) {
          keysCache.delete(key);
        } else {
          keysCache.add(key);
        }
      }

      callback(Array.from(keysCache));
    };

    this.doc.on('afterTransaction', ob);

    return () => {
      this.doc.off('afterTransaction', ob);
    };
  }

  delete(key: Key) {
    const record = this.record(key);

    this.doc.transact(() => {
      for (const key of record.keys()) {
        if (!this.hiddenFields.includes(key)) {
          record.delete(key);
        }
      }
      record.set(this.deleteFlagKey, true);
    }, this.origin);
    this.markCacheStaled();
  }

  private isDeleted(record: YMap<any>) {
    return record.has(this.deleteFlagKey);
  }

  private record(key: Key) {
    return this.doc.getMap(key.toString());
  }

  private value(record: YMap<any>) {
    if (this.isDeleted(record) || !record.size) {
      return null;
    }

    return omit(record.toJSON(), this.hiddenFields);
  }

  private buildKeysCache() {
    if (!this.keysCache || this.cacheStaled) {
      this.keysCache = new Set();

      for (const key of this.doc.share.keys()) {
        const record = this.doc.getMap(key);
        if (!this.isDeleted(record)) {
          this.keysCache.add(this.keyof(record));
        }
      }
      this.cacheStaled = false;
    }

    return this.keysCache;
  }

  private markCacheStaled() {
    this.cacheStaled = true;
  }

  private keyof(record: YMap<any>) {
    return record.get(this.keyFlagKey);
  }

  private keyBy(record: YMap<any>, key: Key) {
    record.set(this.keyFlagKey, key);
  }
}
