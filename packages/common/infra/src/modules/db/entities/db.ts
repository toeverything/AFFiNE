import { Entity } from '../../../framework';
import type { DBSchemaBuilder, TableMap } from '../../../orm';
import { Table } from './table';

export class DB<Schema extends DBSchemaBuilder> extends Entity<{
  db: TableMap<Schema>;
  schema: Schema;
  storageDocId: (tableName: string) => string;
}> {
  readonly db = this.props.db;

  constructor() {
    super();
    Object.entries(this.props.schema).forEach(([tableName]) => {
      const table = this.framework.createEntity(Table, {
        table: this.db[tableName],
        storageDocId: this.props.storageDocId(tableName),
      });
      Object.defineProperty(this, tableName, {
        get: () => table,
      });
    });
  }
}

export type DBWithTables<Schema extends DBSchemaBuilder> = DB<Schema> & {
  [K in keyof Schema]: Table<Schema[K]>;
};
