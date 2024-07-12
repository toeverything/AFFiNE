import { isUndefined, omitBy } from 'lodash-es';
import { Observable, shareReplay } from 'rxjs';

import type { DBAdapter, TableAdapter } from './adapters';
import type {
  DBSchemaBuilder,
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

type RequiredFields<T extends TableSchemaBuilder> = {
  [K in keyof T as T[K] extends FieldSchemaBuilder<any, infer Optional>
    ? Optional extends false
      ? K
      : never
    : never]: T[K] extends FieldSchemaBuilder<infer Type> ? Type : never;
};

type OptionalFields<T extends TableSchemaBuilder> = {
  [K in keyof T as T[K] extends FieldSchemaBuilder<any, infer Optional>
    ? Optional extends true
      ? K
      : never
    : never]?: T[K] extends FieldSchemaBuilder<infer Type> ? Type : never;
};

type PrimaryKeyField<T extends TableSchemaBuilder> = {
  [K in keyof T]: T[K] extends FieldSchemaBuilder<any, any, infer PrimaryKey>
    ? PrimaryKey extends true
      ? K
      : never
    : never;
}[keyof T];

export type NonPrimaryKeyFields<T extends TableSchemaBuilder> = {
  [K in keyof T]: T[K] extends FieldSchemaBuilder<any, any, infer PrimaryKey>
    ? PrimaryKey extends false
      ? K
      : never
    : never;
}[keyof T];

export type PrimaryKeyFieldType<T extends TableSchemaBuilder> =
  T[PrimaryKeyField<T>] extends FieldSchemaBuilder<infer Type>
    ? Type extends Key
      ? Type
      : never
    : never;

export type CreateEntityInput<T extends TableSchemaBuilder> = Pretty<
  RequiredFields<T> & OptionalFields<T>
>;

// @TODO(@forehalo): return value need to be specified with `Default` inference
export type Entity<T extends TableSchemaBuilder> = Pretty<
  CreateEntityInput<T> & {
    [key in PrimaryKeyField<T>]: PrimaryKeyFieldType<T>;
  }
>;

export type UpdateEntityInput<T extends TableSchemaBuilder> = Pretty<{
  [key in NonPrimaryKeyFields<T>]?: T[key] extends FieldSchemaBuilder<
    infer Type
  >
    ? Type
    : never;
}>;

export type FindEntityInput<T extends TableSchemaBuilder> = Pretty<{
  [key in keyof T]?: T[key] extends FieldSchemaBuilder<infer Type>
    ? Type
    : never;
}>;

export class Table<T extends TableSchemaBuilder> {
  readonly schema: TableSchema;
  readonly keyField: string = '';
  private readonly adapter: TableAdapter;

  private readonly subscribedKeys: Map<Key, Observable<any>> = new Map();

  constructor(
    db: DBAdapter,
    public readonly name: string,
    private readonly opts: TableOptions
  ) {
    this.adapter = db.table(name) as any;
    this.schema = Object.entries(this.opts.schema).reduce(
      (acc, [fieldName, fieldBuilder]) => {
        acc[fieldName] = fieldBuilder.schema;
        if (fieldBuilder.schema.isPrimaryKey) {
          // @ts-expect-error still in constructor
          this.keyField = fieldName;
        }
        return acc;
      },
      {} as TableSchema
    );
    this.adapter.setup({ ...opts, keyField: this.keyField });
  }

  create(input: CreateEntityInput<T>): Entity<T> {
    const data = Object.entries(this.schema).reduce(
      (acc, [key, schema]) => {
        const inputVal = acc[key];

        if (inputVal === undefined) {
          if (schema.optional) {
            acc[key] = null;
          }

          if (schema.default) {
            acc[key] = schema.default() ?? null;
          }
        }

        return acc;
      },
      omitBy(input, isUndefined) as any
    );

    validators.validateCreateEntityData(this, data);

    return this.adapter.insert({
      data: data,
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

  get$(key: PrimaryKeyFieldType<T>): Observable<Entity<T>> {
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

  find(where: FindEntityInput<T>): Entity<T>[] {
    return this.adapter.find({
      where: Object.entries(where).map(([field, value]) => ({
        field,
        value,
      })),
    });
  }

  find$(where: FindEntityInput<T>): Observable<Entity<T>[]> {
    return new Observable<Entity<T>[]>(subscriber => {
      const unsubscribe = this.adapter.observe({
        where: Object.entries(where).map(([field, value]) => ({
          field,
          value,
        })),
        callback: data => {
          subscriber.next(data);
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
