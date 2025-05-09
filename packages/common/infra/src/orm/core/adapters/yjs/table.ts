import { pick } from 'lodash-es';
import {
  type AbstractType,
  type Doc,
  Map as YMap,
  type Transaction,
} from 'yjs';

import { shallowEqual } from '../../../../utils/shallow-equal';
import { validators } from '../../validators';
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
  private keyField: string = 'key';
  private fields: string[] = [];

  private readonly origin = 'YjsTableAdapter';

  constructor(
    private readonly tableName: string,
    private readonly doc: Doc
  ) {}

  setup(opts: TableAdapterOptions): void {
    this.keyField = opts.keyField;
    this.fields = Object.keys(opts.schema);
  }

  dispose() {
    this.doc.destroy();
  }

  insert(query: InsertQuery) {
    const { data, select } = query;
    validators.validateYjsEntityData(this.tableName, data);
    const key = data[this.keyField];
    const record = this.doc.getMap(key.toString());

    this.doc.transact(() => {
      for (const key in data) {
        if (data[key] === undefined) {
          // skip undefined fields, avoid unexpected override
          continue;
        }
        record.set(key, data[key]);
      }

      record.delete(this.deleteFlagKey);
    }, this.origin);

    return this.value(record, select);
  }

  update(query: UpdateQuery) {
    const { data, select, where } = query;
    validators.validateYjsEntityData(this.tableName, data);

    const results: any[] = [];
    this.doc.transact(() => {
      for (const record of this.iterate(where)) {
        results.push(this.value(record, select));
        for (const key in data) {
          this.setField(record, key, data[key]);
        }
      }
    }, this.origin);

    return results;
  }

  find(query: FindQuery) {
    const { where, select } = query;
    const records: any[] = [];
    for (const record of this.iterate(where)) {
      records.push(this.value(record, select));
    }

    return records;
  }

  observe(query: ObserveQuery) {
    const { where, select, callback } = query;

    let listeningOnAll = false;
    const results = new Map<string, any>();

    if (!where) {
      listeningOnAll = true;
    }

    for (const record of this.iterate(where)) {
      results.set(this.keyof(record), this.value(record, select));
    }

    callback(Array.from(results.values()));

    const ob = (tx: Transaction) => {
      let hasChanged = false;
      for (const [ty] of tx.changed) {
        const record = ty;
        const key = this.keyof(record);
        const isMatch =
          (listeningOnAll || (where && this.match(record, where))) &&
          !this.isDeleted(record);
        const prevMatch = results.get(key);
        const isPrevMatched = results.has(key);

        if (isMatch && isPrevMatched) {
          const newValue = this.value(record, select);
          if (
            !(
              prevMatch === newValue ||
              (!select && // if select is set, we will check the value
                select !== '*' &&
                select !== 'key' &&
                // skip if the value is the same
                shallowEqual(prevMatch, newValue))
            )
          ) {
            results.set(key, newValue);
            hasChanged = true;
          }
        } else if (isMatch && !isPrevMatched) {
          results.set(this.keyof(record), this.value(record, select));
          hasChanged = true;
        } else if (!isMatch && isPrevMatched) {
          results.delete(key);
          hasChanged = true;
        }
      }

      if (hasChanged) {
        callback(Array.from(results.values()));
      }
    };

    this.doc.on('afterTransaction', ob);
    return () => {
      this.doc.off('afterTransaction', ob);
    };
  }

  delete(query: DeleteQuery) {
    const { where } = query;

    this.doc.transact(() => {
      for (const record of this.iterate(where)) {
        this.deleteTy(record);
      }
    }, this.origin);
  }

  toObject(ty: AbstractType<any>): Record<string, any> {
    return YMap.prototype.toJSON.call(ty);
  }

  private recordByKey(key: string): AbstractType<any> | null {
    // detect if the record is there otherwise yjs will create an empty Map.
    if (this.doc.share.has(key)) {
      return this.doc.getMap(key);
    }

    return null;
  }

  private *iterate(where?: WhereCondition) {
    if (!where) {
      for (const map of this.doc.share.values()) {
        if (!this.isDeleted(map)) {
          yield map;
        }
      }
    }
    // fast pass for key lookup without iterating the whole table
    else if ('byKey' in where) {
      const record = this.recordByKey(where.byKey.toString());
      if (record) {
        yield record;
      }
    } else if (Array.isArray(where)) {
      for (const map of this.doc.share.values()) {
        if (this.match(map, where)) {
          yield map;
        }
      }
    }
  }

  private value(record: AbstractType<any>, select: Select = '*') {
    if (this.isDeleted(record) || this.isEmpty(record)) {
      return null;
    }

    let selectedFields: string[];
    if (select === 'key') {
      return this.keyof(record);
    } else if (select === '*') {
      return this.toObject(record);
    } else {
      selectedFields = select;
    }

    return pick(this.toObject(record), selectedFields);
  }

  private match(record: AbstractType<any>, where: WhereCondition) {
    return (
      !this.isDeleted(record) &&
      (Array.isArray(where)
        ? where.length === 0
          ? false
          : where.every(c => {
              const field = this.field(record, c.field);
              const condition = c.value;

              if (typeof condition === 'object') {
                if (condition === null) {
                  return field === null;
                }

                if ('not' in condition) {
                  return field !== condition.not;
                }
              }

              return field === condition;
            })
        : where.byKey === this.keyof(record))
    );
  }

  private isDeleted(record: AbstractType<any>) {
    return (
      this.field(record, this.deleteFlagKey) === true || this.isEmpty(record)
    );
  }

  private keyof(record: AbstractType<any>) {
    return this.field(record, this.keyField);
  }

  private field(ty: AbstractType<any>, field: string) {
    const val = YMap.prototype.get.call(ty, field);

    // only handle null will make the day easier
    if (val === undefined) {
      return null;
    }

    return val;
  }

  private setField(ty: AbstractType<any>, field: string, value: any) {
    YMap.prototype.set.call(ty, field, value);
  }

  private isEmpty(ty: AbstractType<any>) {
    return ty._map.size === 0;
  }

  private deleteTy(ty: AbstractType<any>) {
    this.fields.forEach(field => {
      if (field !== this.keyField) {
        YMap.prototype.delete.call(ty, field);
      }
    });
    YMap.prototype.set.call(ty, this.deleteFlagKey, true);
  }
}
