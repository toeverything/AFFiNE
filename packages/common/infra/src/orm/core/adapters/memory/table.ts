import { merge, pick } from 'lodash-es';

import { HookAdapter } from '../mixins';
import type {
  DeleteQuery,
  FindQuery,
  InsertQuery,
  ObserveQuery,
  Select,
  TableAdapter,
  TableAdapterOptions,
  UpdateQuery,
  WhereCondition,
} from '../types';

@HookAdapter()
export class MemoryTableAdapter implements TableAdapter {
  private readonly data = new Map<string, any>();
  private keyField = 'key';
  private readonly subscriptions = new Set<(key: string, data: any) => void>();

  constructor(private readonly tableName: string) {}

  setup(opts: TableAdapterOptions) {
    this.keyField = opts.keyField;
  }

  dispose() {}

  insert(query: InsertQuery) {
    const { data, select } = query;
    const key = String(data[this.keyField]);

    if (this.data.has(key)) {
      throw new Error(
        `Record with key ${key} already exists in table ${this.tableName}`
      );
    }

    this.data.set(key, data);
    this.dispatch(key, data);
    return this.value(data, select);
  }

  find(query: FindQuery) {
    const { where, select } = query;
    const result = [];

    for (const record of this.iterate(where)) {
      result.push(this.value(record, select));
    }

    return result;
  }

  observe(query: ObserveQuery): () => void {
    const { where, select, callback } = query;

    let listeningOnAll = false;
    const obKeys = new Set<string>();
    const results = [];

    if (!where) {
      listeningOnAll = true;
    } else if ('byKey' in where) {
      obKeys.add(where.byKey.toString());
    }

    for (const record of this.iterate(where)) {
      const key = String(record[this.keyField]);
      if (!listeningOnAll) {
        obKeys.add(key);
      }
      results.push(this.value(record, select));
    }

    callback(results);

    const ob = (key: string, data: any) => {
      if (
        listeningOnAll ||
        obKeys.has(key) ||
        (where && this.match(data, where))
      ) {
        callback(this.find({ where, select }));
        return;
      }
    };

    this.subscriptions.add(ob);

    return () => {
      this.subscriptions.delete(ob);
    };
  }

  update(query: UpdateQuery) {
    const { where, data, select } = query;
    const result = [];

    for (let record of this.iterate(where)) {
      record = merge({}, record, data);
      const key = String(record[this.keyField]);
      this.data.set(key, record);
      this.dispatch(key, record);
      result.push(this.value(this.value(record, select)));
    }

    return result;
  }

  delete(query: DeleteQuery) {
    const { where } = query;

    for (const record of this.iterate(where)) {
      const key = String(record[this.keyField]);
      this.data.delete(key);
      this.dispatch(key, null);
    }
  }

  toObject(record: any): Record<string, any> {
    return record;
  }

  value(data: any, select: Select = '*') {
    if (select === 'key') {
      return data[this.keyField];
    }

    if (select === '*') {
      return this.toObject(data);
    }

    return pick(this.toObject(data), select);
  }

  private *iterate(where: WhereCondition = []) {
    if (Array.isArray(where)) {
      for (const value of this.data.values()) {
        if (this.match(value, where)) {
          yield value;
        }
      }
    } else {
      const key = where.byKey;
      const record = this.data.get(key.toString());
      if (record) {
        yield record;
      }
    }
  }

  private match(record: any, where: WhereCondition) {
    return Array.isArray(where)
      ? where.every(c => record[c.field] === c.value)
      : where.byKey === record[this.keyField];
  }

  private dispatch(key: string, data: any) {
    this.subscriptions.forEach(callback => callback(key, data));
  }
}
