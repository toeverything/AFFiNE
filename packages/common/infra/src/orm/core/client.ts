import { type DBAdapter, type Hook } from './adapters';
import type { DBSchemaBuilder } from './schema';
import { type CreateEntityInput, Table, type TableMap } from './table';
import { validators } from './validators';

export class ORMClient {
  static hooksMap: Map<string, Hook<any>[]> = new Map();
  readonly tables = new Map<string, Table<any>>();
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
              hooks: ORMClient.hooksMap.get(tableName),
            });
            this.tables.set(tableName, table);
          }
          return table;
        },
      });
    });
  }

  static defineHook(tableName: string, _desc: string, hook: Hook<any>) {
    let hooks = this.hooksMap.get(tableName);
    if (!hooks) {
      hooks = [];
      this.hooksMap.set(tableName, hooks);
    }

    hooks.push(hook);
  }
}

export function createORMClient<Schema extends DBSchemaBuilder>(
  db: Schema
): ORMClientWithTablesClass<Schema> {
  Object.entries(db).forEach(([tableName, schema]) => {
    validators.validateTableSchema(tableName, schema);
  });

  class ORMClientWithTables extends ORMClient {
    constructor(adapter: DBAdapter) {
      super(db, adapter);
    }
  }

  return ORMClientWithTables as any;
}

export type ORMClientWithTablesClass<Schema extends DBSchemaBuilder> = {
  new (adapter: DBAdapter): TableMap<Schema> & ORMClient;

  defineHook<TableName extends keyof Schema>(
    tableName: TableName,
    desc: string,
    hook: Hook<CreateEntityInput<Schema[TableName]>>
  ): void;
};
