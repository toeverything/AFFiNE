import { type DBAdapter, type Hook } from './adapters';
import type { DBSchemaBuilder } from './schema';
import { Table, type TableMap } from './table';
import { validators } from './validators';

class RawORMClient {
  hooksMap: Map<string, Hook<any>[]> = new Map();
  private readonly tables = new Map<string, Table<any>>();
  constructor(
    protected readonly db: DBSchemaBuilder,
    protected readonly adapter: DBAdapter
  ) {
    Object.entries(db).forEach(([tableName, tableSchema]) => {
      Object.defineProperty(this, tableName, {
        get: () => {
          let table = this.tables.get(tableName);
          if (!table) {
            table = new Table(this.adapter, tableName, {
              schema: tableSchema,
              hooks: this.hooksMap.get(tableName),
            });
            this.tables.set(tableName, table);
          }
          return table;
        },
      });
    });
  }

  defineHook(tableName: string, _desc: string, hook: Hook<any>) {
    let hooks = this.hooksMap.get(tableName);
    if (!hooks) {
      hooks = [];
      this.hooksMap.set(tableName, hooks);
    }

    hooks.push(hook);
  }
}

export function createORMClient<
  const Schema extends DBSchemaBuilder,
  AdapterConstructor extends new (...args: any[]) => DBAdapter,
  AdapterConstructorParams extends
    any[] = ConstructorParameters<AdapterConstructor> extends [
    DBSchemaBuilder,
    ...infer Args,
  ]
    ? Args
    : never,
>(
  db: Schema,
  adapter: AdapterConstructor,
  ...args: AdapterConstructorParams
): ORMClient<Schema> {
  Object.entries(db).forEach(([tableName, schema]) => {
    validators.validateTableSchema(tableName, schema);
  });

  return new RawORMClient(db, new adapter(db, ...args)) as TableMap<Schema> &
    RawORMClient;
}

export type ORMClient<Schema extends DBSchemaBuilder> = RawORMClient &
  TableMap<Schema>;
