import { pick } from 'lodash-es';

import { shallowEqual } from '../../../../utils/shallow-equal';
import type {
  SessionCommit,
  SessionReadValue,
  TypeTarget,
  YOctoDocSession,
} from '../../../../y-octo-session';
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

function unwrapAny(val: SessionReadValue | null): any {
  if (!val) {
    return undefined;
  }
  if ('Any' in val) {
    return val.Any;
  }
  return undefined;
}

/**
 * y-octo-wasm (`DocSession`) Adapter for AFFiNE ORM.
 *
 * Structure matches `YjsTableAdapter` wire-for-wire:
 * Each table is a `YOctoDocSession` instance; each row is a root `Map`
 * keyed by `record[keyField].toString()`, with `$$DELETED: true` tombstones.
 */
@HookAdapter()
export class YOctoTableAdapter implements TableAdapter {
  private readonly deleteFlagKey = '$$DELETED';
  private keyField = 'key';
  private fields: string[] = [];

  private readonly origin = 'YOctoTableAdapter';

  constructor(
    private readonly tableName: string,
    private readonly doc: YOctoDocSession
  ) {}

  setup(opts: TableAdapterOptions): void {
    this.keyField = opts.keyField;
    this.fields = Object.keys(opts.schema);
  }

  dispose(): void {
    this.doc.destroy();
  }

  insert(query: InsertQuery) {
    const { data, select } = query;
    validators.validateYjsEntityData(this.tableName, data);
    const key = data[this.keyField];
    const rootName = key.toString();
    const target: TypeTarget = {
      Identity: this.doc.ensureRoot(rootName, 'Map'),
    };

    this.doc.transact(
      () => {
        for (const field in data) {
          if (data[field] === undefined) {
            continue;
          }
          this.doc.mapSet(target, field, { Any: data[field] });
        }

        this.doc.mapRemove(target, this.deleteFlagKey);
      },
      this.origin,
      'Untracked'
    );

    return this.value(rootName, select);
  }

  update(query: UpdateQuery) {
    const { data, select, where } = query;
    validators.validateYjsEntityData(this.tableName, data);

    const results: any[] = [];
    this.doc.transact(
      () => {
        for (const rootName of this.iterate(where)) {
          results.push(this.value(rootName, select));
          const target: TypeTarget = { Identity: { Root: rootName } };
          for (const field in data) {
            if (data[field] === undefined) {
              continue;
            }
            this.doc.mapSet(target, field, { Any: data[field] });
          }
        }
      },
      this.origin,
      'Untracked'
    );

    return results;
  }

  find(query: FindQuery) {
    const { where, select } = query;
    const records: any[] = [];
    for (const rootName of this.iterate(where)) {
      records.push(this.value(rootName, select));
    }

    return records;
  }

  observe(query: ObserveQuery) {
    const { where, select, callback } = query;

    const listeningOnAll = !where;
    const results = new Map<any, any>();

    for (const rootName of this.iterate(where)) {
      const record = this.readRawRecord(rootName);
      if (record) {
        results.set(this.keyof(record), this.valueFromRaw(record, select));
      }
    }

    callback(Array.from(results.values()));

    const ob = (commit: SessionCommit) => {
      let hasChanged = false;
      const seenRoots = new Set<string>();

      for (const changed of commit.changed) {
        const rootName =
          'Root' in changed.identity
            ? changed.identity.Root
            : changed.path?.root;
        if (!rootName || seenRoots.has(rootName)) {
          continue;
        }
        seenRoots.add(rootName);

        const record = this.readRawRecord(rootName);
        const key = record ? this.keyof(record) : rootName;
        const isMatch =
          record !== null &&
          !this.isDeletedRaw(record) &&
          (listeningOnAll ||
            (where !== undefined && this.matchRaw(record, where)));
        const prevMatch = results.get(key);
        const isPrevMatched = results.has(key);

        if (isMatch && isPrevMatched) {
          const newValue = this.valueFromRaw(record, select);
          const unchanged =
            prevMatch === newValue ||
            (select !== 'key' &&
              prevMatch !== null &&
              newValue !== null &&
              typeof prevMatch === 'object' &&
              typeof newValue === 'object' &&
              shallowEqual(prevMatch, newValue));
          if (!unchanged) {
            results.set(key, newValue);
            hasChanged = true;
          }
        } else if (isMatch && !isPrevMatched) {
          results.set(key, this.valueFromRaw(record, select));
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

    this.doc.transact(
      () => {
        for (const rootName of this.iterate(where)) {
          this.deleteRoot(rootName);
        }
      },
      this.origin,
      'Untracked'
    );
  }

  toObject(record: Record<string, any>): Record<string, any> {
    return { ...record };
  }

  private readRawRecord(rootName: string): Record<string, any> | null {
    if (!this.doc.hasRoot(rootName)) {
      return null;
    }
    const entries = this.doc.readMap({ Identity: { Root: rootName } });
    if (entries.length === 0) {
      return null;
    }
    const obj: Record<string, any> = {};
    for (const [k, v] of entries) {
      obj[k] = unwrapAny(v);
    }
    return obj;
  }

  private *iterate(where?: WhereCondition): Generator<string> {
    if (!where) {
      for (const rootName of this.doc.getRootNames()) {
        const record = this.readRawRecord(rootName);
        if (record && !this.isDeletedRaw(record)) {
          yield rootName;
        }
      }
    } else if ('byKey' in where) {
      const rootName = where.byKey.toString();
      const record = this.readRawRecord(rootName);
      if (record && !this.isDeletedRaw(record)) {
        yield rootName;
      }
    } else if (Array.isArray(where)) {
      for (const rootName of this.doc.getRootNames()) {
        const record = this.readRawRecord(rootName);
        if (record && this.matchRaw(record, where)) {
          yield rootName;
        }
      }
    }
  }

  private value(rootName: string, select: Select = '*') {
    const record = this.readRawRecord(rootName);
    if (!record) {
      return null;
    }
    return this.valueFromRaw(record, select);
  }

  private valueFromRaw(record: Record<string, any>, select: Select = '*') {
    if (this.isDeletedRaw(record)) {
      return null;
    }
    if (select === 'key') {
      return this.keyof(record);
    }
    if (select === '*') {
      return this.toObject(record);
    }
    return pick(this.toObject(record), select);
  }

  private matchRaw(record: Record<string, any>, where: WhereCondition) {
    return (
      !this.isDeletedRaw(record) &&
      (Array.isArray(where)
        ? where.length === 0
          ? false
          : where.every(c => {
              const field = this.fieldRaw(record, c.field);
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

  private isDeletedRaw(record: Record<string, any>) {
    return (
      this.fieldRaw(record, this.deleteFlagKey) === true ||
      Object.keys(record).length === 0
    );
  }

  private keyof(record: Record<string, any>) {
    return this.fieldRaw(record, this.keyField);
  }

  private fieldRaw(record: Record<string, any>, field: string) {
    const val = record[field];
    if (val === undefined) {
      return null;
    }
    return val;
  }

  private deleteRoot(rootName: string) {
    const target: TypeTarget = { Identity: { Root: rootName } };
    for (const field of this.fields) {
      if (field !== this.keyField) {
        this.doc.mapRemove(target, field);
      }
    }
    this.doc.mapSet(target, this.deleteFlagKey, { Any: true });
  }
}
