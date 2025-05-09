import { isUndefined, omitBy } from 'lodash-es';
import { Observable, shareReplay } from 'rxjs';

import type { DBAdapter, TableAdapter } from './adapters';
import type {
  DBSchemaBuilder,
  DocumentTableSchemaBuilder,
  FieldSchemaBuilder,
  TableSchema,
  TableSchemaBuilder,
} from './schema';
import type { Key, TableOptions } from './types';
import { validators } from './validators';

type Pretty<T> = T extends any
  ? {
      -readonly [P in keyof T]: T[P];
    }
  : never;

// filter out all fields starting with `__`
type TableDefinedFieldNames<T extends TableSchemaBuilder> = keyof {
  [K in keyof T as K extends `__${string}` ? never : K]: T[K];
};

type Typeof<F extends FieldSchemaBuilder> =
  F extends FieldSchemaBuilder<infer Type> ? Type : never;

type RequiredFields<T extends TableSchemaBuilder> = {
  [K in TableDefinedFieldNames<T> as T[K] extends FieldSchemaBuilder<
    any,
    infer Optional
  >
    ? Optional extends false
      ? K
      : never
    : never]: Typeof<T[K]>;
};

type OptionalFields<T extends TableSchemaBuilder> = {
  [K in TableDefinedFieldNames<T> as T[K] extends FieldSchemaBuilder<
    any,
    infer Optional
  >
    ? Optional extends true
      ? K
      : never
    : never]?: Typeof<T[K]> | null;
};

type PrimaryKeyField<T extends TableSchemaBuilder> = {
  [K in TableDefinedFieldNames<T>]: T[K] extends FieldSchemaBuilder<
    any,
    any,
    infer PrimaryKey
  >
    ? PrimaryKey extends true
      ? K
      : never
    : never;
}[TableDefinedFieldNames<T>];

type TableDefinedEntity<T extends TableSchemaBuilder> = Pretty<
  RequiredFields<T> &
    OptionalFields<T> & {
      [PrimaryKey in PrimaryKeyField<T>]: Typeof<T[PrimaryKey]>;
    }
>;

type MaybeDocumentEntityWrapper<Schema, Ty> =
  Schema extends DocumentTableSchemaBuilder
    ? Ty & {
        [key: string]: any;
      }
    : Ty;

type NonPrimaryKeyFieldNames<T extends TableSchemaBuilder> = {
  [K in TableDefinedFieldNames<T>]: T[K] extends FieldSchemaBuilder<
    any,
    any,
    infer PrimaryKey
  >
    ? PrimaryKey extends false
      ? K
      : never
    : never;
}[TableDefinedFieldNames<T>];

// CRUD api types
export type PrimaryKeyFieldType<T extends TableSchemaBuilder> = Typeof<
  T[PrimaryKeyField<T>]
>;

export type CreateEntityInput<T extends TableSchemaBuilder> = Pretty<
  MaybeDocumentEntityWrapper<T, RequiredFields<T> & OptionalFields<T>>
>;

// @TODO(@forehalo): return value need to be specified with `Default` inference
export type Entity<T extends TableSchemaBuilder> = Pretty<
  MaybeDocumentEntityWrapper<T, TableDefinedEntity<T>>
>;

export type UpdateEntityInput<T extends TableSchemaBuilder> = Pretty<
  MaybeDocumentEntityWrapper<
    T,
    {
      [key in NonPrimaryKeyFieldNames<T>]?: key extends keyof TableDefinedEntity<T>
        ? TableDefinedEntity<T>[key]
        : never;
    }
  >
>;

export type FindEntityInput<T extends TableSchemaBuilder> = Pretty<
  MaybeDocumentEntityWrapper<
    T,
    {
      [key in TableDefinedFieldNames<T>]?: key extends keyof TableDefinedEntity<T>
        ?
            | TableDefinedEntity<T>[key]
            | { not: TableDefinedEntity<T>[key] | null }
            | null
        : never;
    }
  >
>;

export class Table<T extends TableSchemaBuilder> {
  readonly schema: TableSchema = {};
  readonly keyField: string = '';
  private readonly adapter: TableAdapter;
  public readonly isDocumentTable: boolean = false;

  private readonly subscribedKeys: Map<Key, Observable<any>> = new Map();

  constructor(
    db: DBAdapter,
    public readonly name: string,
    private readonly opts: TableOptions
  ) {
    this.adapter = db.table(name) as any;
    for (const [fieldName, fieldBuilder] of Object.entries(this.opts.schema)) {
      // handle internal fields
      if (fieldName.startsWith('__')) {
        if (fieldName === '__document') {
          this.isDocumentTable = true;
        }
        continue;
      }

      this.schema[fieldName] = fieldBuilder.schema;
      if (fieldBuilder.schema.isPrimaryKey) {
        this.keyField = fieldName;
      }
    }
    this.adapter.setup({ ...opts, keyField: this.keyField });
  }

  create(input: CreateEntityInput<T>): Entity<T> {
    const data = Object.entries(this.schema).reduce(
      (acc, [key, schema]) => {
        const inputVal = acc[key];

        if (inputVal === undefined) {
          if (schema.optional) {
            acc[key] = undefined;
          }

          if (schema.default) {
            acc[key] = schema.default() ?? undefined;
          }
        }

        return acc;
      },
      omitBy(input, isUndefined) as any
    );

    validators.validateCreateEntityData(this, data);

    return this.adapter.insert({
      data,
    });
  }

  update(
    key: PrimaryKeyFieldType<T>,
    input: UpdateEntityInput<T>
  ): Entity<T> | null {
    validators.validateUpdateEntityData(this, input);

    const [record] = this.adapter.update({
      where: {
        byKey: key,
      },
      data: input,
    });

    return record || null;
  }

  get(key: PrimaryKeyFieldType<T>): Entity<T> | null {
    const [record] = this.adapter.find({
      where: {
        byKey: key,
      },
    });

    return record || null;
  }

  get$(key: PrimaryKeyFieldType<T>): Observable<Entity<T> | null> {
    let ob$ = this.subscribedKeys.get(key);

    if (!ob$) {
      ob$ = new Observable<Entity<T>>(subscriber => {
        const unsubscribe = this.adapter.observe({
          where: {
            byKey: key,
          },
          callback: ([data]) => {
            subscriber.next(data || null);
          },
        });

        return () => {
          unsubscribe();
          this.subscribedKeys.delete(key);
        };
      }).pipe(
        shareReplay({
          refCount: true,
          bufferSize: 1,
        })
      );

      this.subscribedKeys.set(key, ob$);
    }

    return ob$;
  }

  find(where?: FindEntityInput<T>): Entity<T>[] {
    return this.adapter.find({
      where: !where
        ? undefined
        : Object.entries(where)
            .map(([field, value]) => ({
              field,
              value,
            }))
            .filter(({ value }) => value !== undefined),
    });
  }

  find$(where?: FindEntityInput<T>): Observable<Entity<T>[]> {
    return new Observable<Entity<T>[]>(subscriber => {
      const unsubscribe = this.adapter.observe({
        where: !where
          ? undefined
          : Object.entries(where)
              .map(([field, value]) => ({
                field,
                value,
              }))
              .filter(({ value }) => value !== undefined),
        callback: data => {
          subscriber.next(data);
        },
      });

      return unsubscribe;
    });
  }

  select<Key extends keyof Entity<T>>(
    selectKey: Key,
    where?: FindEntityInput<T>
  ): Pick<Entity<T>, Key | PrimaryKeyField<T>>[] {
    const items = this.adapter.find({
      where: !where
        ? undefined
        : Object.entries(where)
            .map(([field, value]) => ({
              field,
              value,
            }))
            .filter(({ value }) => value !== undefined),
    });

    return items.map(item => {
      const { [this.keyField]: key, [selectKey]: selected } = item;
      return {
        [this.keyField]: key,
        [selectKey]: selected,
      } as Pick<Entity<T>, Key | PrimaryKeyField<T>>;
    });
  }

  select$<Key extends keyof Entity<T>>(
    selectKey: Key,
    where?: FindEntityInput<T>
  ): Observable<Pick<Entity<T>, Key | PrimaryKeyField<T>>[]> {
    return new Observable(subscriber => {
      const unsubscribe = this.adapter.observe({
        where: !where
          ? undefined
          : Object.entries(where)
              .map(([field, value]) => ({
                field,
                value,
              }))
              .filter(({ value }) => value !== undefined),
        select: [this.keyField, selectKey as string],
        callback: data => {
          subscriber.next(
            data.map(item => {
              const { [this.keyField]: key, [selectKey]: selected } = item;
              return {
                [this.keyField]: key,
                [selectKey]: selected,
              } as Pick<Entity<T>, Key | PrimaryKeyField<T>>;
            })
          );
        },
      });

      return unsubscribe;
    });
  }

  keys(): PrimaryKeyFieldType<T>[] {
    return this.adapter.find({
      select: 'key',
    });
  }

  keys$(): Observable<PrimaryKeyFieldType<T>[]> {
    let ob$ = this.subscribedKeys.get('$$KEYS');

    if (!ob$) {
      ob$ = new Observable<PrimaryKeyFieldType<T>[]>(subscriber => {
        const unsubscribe = this.adapter.observe({
          select: 'key',
          callback: (keys: PrimaryKeyFieldType<T>[]) => {
            subscriber.next(keys);
          },
        });

        return () => {
          unsubscribe();
          this.subscribedKeys.delete('$$KEYS');
        };
      }).pipe(
        shareReplay({
          refCount: true,
          bufferSize: 1,
        })
      );

      this.subscribedKeys.set('$$KEYS', ob$);
    }

    return ob$;
  }

  delete(key: PrimaryKeyFieldType<T>) {
    this.adapter.delete({
      where: {
        byKey: key,
      },
    });
  }
}

export type TableMap<Tables extends DBSchemaBuilder> = {
  readonly [K in keyof Tables]: Table<Tables[K]>;
};
