import { Observable } from 'rxjs';
import type { AbstractType as YAbstract, Array as YArray, Doc } from 'yjs';
import { Map as YMap } from 'yjs';

export const table = <T extends Record<string, Filed>>(
  name: string,
  schema: T
): TableSchema<T> => {
  return {
    __name: name,
    __schema: schema,
    // type
    __data: {} as GetSchemaDataType<T>,
  };
};

type TableSchema<T extends Record<string, Filed>> = {
  __name: string;
  __schema: T;
  __data: GetSchemaDataType<T>;
};
type ColumnType = 'string' | 'boolean' | 'json' | 'number' | 'raw';

class Filed<
  Type = unknown,
  Required extends boolean = boolean,
  Default extends boolean = boolean,
> {
  constructor(
    public readonly ops: {
      type: ColumnType;
      required: Required;
      hasDefault: Default;
      default?: () => Type;
    }
  ) {}

  required(): Filed<Type, true, Default> {
    return new Filed({
      ...this.ops,
      required: true,
    });
  }

  default(value: () => Type): Filed<Type, Required, true> {
    return new Filed({
      ...this.ops,
      default: value,
      hasDefault: true,
    });
  }
}

export const f = {
  string: (): Filed<string, false, false> => {
    return new Filed({
      type: 'string',
      required: false,
      hasDefault: false,
    });
  },
  boolean: (): Filed<boolean, false, false> => {
    return new Filed({
      type: 'boolean',
      required: false,
      hasDefault: false,
    });
  },
  number: (): Filed<number, false, false> => {
    return new Filed({
      type: 'number',
      required: false,
      hasDefault: false,
    });
  },
  json: <T>(): Filed<T, false, false> => {
    return new Filed({
      type: 'json',
      required: false,
      hasDefault: false,
    });
  },
  raw: <T extends YAbstract<any>>(): Filed<T, false, false> => {
    return new Filed({
      type: 'raw',
      required: false,
      hasDefault: false,
    });
  },
};
type Where<Schema extends Record<string, Filed>> = Partial<
  GetSchemaDataType<Schema>
>;

type ConvertProperty<T extends Filed> = T extends Filed<infer R, infer _>
  ? R
  : never;
type ToRequired<T extends Record<string, Filed>, P> = {
  [K in keyof T as T[K] extends P ? K : never]-?: ConvertProperty<T[K]>;
};
type ToOptional<T extends Record<string, Filed>, P> = {
  [K in keyof T as T[K] extends P ? K : never]?: ConvertProperty<T[K]>;
};

type GetSchemaDataType<T extends Record<string, Filed>> = Pretty<
  ToRequired<T, Filed<any, true>> & ToOptional<T, Filed<any, false>>
>;

type GetSchemaCreateType<T extends Record<string, Filed>> = Pretty<
  ToRequired<T, Filed<any, true, false>> &
    ToOptional<T, Filed<any, false, true>> &
    ToOptional<T, Filed<any, true, true>> &
    ToOptional<T, Filed<any, false, false>>
>;
type Pretty<T> = T extends any
  ? {
      [P in keyof T]: T[P];
    }
  : never;

export const createDB = (yjs: Doc) => {
  const find = (arr: YArray<YMap<unknown>>, where: [string, unknown][]) => {
    for (const item of arr) {
      const isMatch = where.every(([key, value]) => {
        return item.get(key) === value;
      });
      if (isMatch) {
        return item;
      }
    }
    return;
  };
  const filter = (arr: YArray<YMap<unknown>>, where: [string, unknown][]) => {
    const result = [];
    for (const item of arr) {
      const isMatch = where.every(([key, value]) => {
        return item.get(key) === value;
      });
      if (isMatch) {
        result.push(item);
      }
    }
    return result;
  };
  const toObject = <T>(map: YMap<unknown>): T => {
    return Object.fromEntries(map.entries()) as T;
  };

  return {
    findFirst: <Schema extends Record<string, Filed>>(
      from: TableSchema<Schema>,
      where: Where<Schema>
    ): GetSchemaDataType<Schema> | undefined => {
      const arr = yjs.getArray(from.__name) as YArray<YMap<unknown>>;
      const whereEntries = Object.entries(where);
      const item = find(arr, whereEntries);
      return item ? toObject<GetSchemaDataType<Schema>>(item) : undefined;
    },
    findList: <Schema extends Record<string, Filed>>(
      from: TableSchema<Schema>,
      where: Where<Schema>
    ): GetSchemaDataType<Schema>[] => {
      const arr = yjs.getArray(from.__name) as YArray<YMap<unknown>>;
      const whereEntries = Object.entries(where);
      const items = filter(arr, whereEntries);
      return items.map(toObject<GetSchemaDataType<Schema>>);
    },
    observeFirst: <Schema extends Record<string, Filed>>(
      from: TableSchema<Schema>,
      where: Where<Schema>
    ): Observable<GetSchemaDataType<Schema> | undefined> => {
      const arr = yjs.getArray(from.__name) as YArray<YMap<unknown>>;
      const whereEntries = Object.entries(where);
      return new Observable(subscriber => {
        const listener = () => {
          const item = find(arr, whereEntries);
          subscriber.next(
            item ? toObject<GetSchemaDataType<Schema>>(item) : undefined
          );
        };
        arr.observe(listener);
        return () => {
          arr.unobserve(listener);
        };
      });
    },
    observeList: <Schema extends Record<string, Filed>>(
      from: TableSchema<Schema>,
      where: Where<Schema>
    ): Observable<GetSchemaDataType<Schema>[]> => {
      const arr = yjs.getArray(from.__name) as YArray<YMap<unknown>>;
      const whereEntries = Object.entries(where);
      return new Observable(subscriber => {
        const listener = () => {
          const items = filter(arr, whereEntries);
          subscriber.next(items.map(toObject<GetSchemaDataType<Schema>>));
        };
        arr.observe(listener);
        return () => {
          arr.unobserve(listener);
        };
      });
    },
    create: <Schema extends Record<string, Filed>>(
      from: TableSchema<Schema>,
      value: GetSchemaCreateType<Schema>
    ): GetSchemaDataType<Schema> => {
      const data = Object.fromEntries(
        Object.entries(from.__schema).map(([key, field]) => {
          if (key in value) {
            return [key, (value as Record<string, unknown>)[key]];
          }
          if (field.ops.default) {
            return [key, field.ops.default()];
          }
          return [key, undefined];
        })
      );
      const arr = yjs.getArray(from.__name) as YArray<YMap<unknown>>;
      arr.insert(0, [new YMap<unknown>(Object.entries(data))]);
      return data as GetSchemaDataType<Schema>;
    },
    update: <Schema extends Record<string, Filed>>(
      from: TableSchema<Schema>,
      where: Where<Schema>,
      value: (
        old: GetSchemaDataType<Schema>
      ) => Partial<GetSchemaDataType<Schema>>
    ) => {
      const arr = yjs.getArray(from.__name) as YArray<YMap<unknown>>;
      const whereKeys = Object.entries(where);
      const item = find(arr, whereKeys);
      if (item) {
        const newValue = value(item.toJSON() as GetSchemaDataType<Schema>);
        Object.entries(newValue).forEach(([key, value]) => {
          item.set(key, value);
        });
      }
    },
    delete: <Schema extends Record<string, Filed>>(
      from: TableSchema<Schema>,
      where: Where<Schema>
    ) => {
      const arr = yjs.getArray(from.__name) as YArray<YMap<unknown>>;
      const whereKeys = Object.entries(where);
      const findIndex = (arr: YArray<YMap<unknown>>) => {
        for (let i = 0; i < arr.length; i++) {
          const item = arr.get(i);
          const isMatch = whereKeys.every(([key, value]) => {
            return item.get(key) === value;
          });
          if (isMatch) {
            return i;
          }
        }
        return -1;
      };
      const index = findIndex(arr);
      if (index !== -1) {
        arr.delete(index, 1);
      }
    },
  };
};
