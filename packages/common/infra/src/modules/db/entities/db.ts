import { Entity } from '../../../framework';
import type { DBSchemaBuilder, TableMap } from '../../../orm';
import { WorkspaceDBTable } from './table';

export class WorkspaceDB<Schema extends DBSchemaBuilder> extends Entity<{
  db: TableMap<Schema>;
  schema: Schema;
  storageDocId: (tableName: string) => string;
}> {
  readonly db = this.props.db;

  constructor() {
    super();
    Object.entries(this.props.schema).forEach(([tableName]) => {
      const table = this.framework.createEntity(WorkspaceDBTable, {
        table: this.db[tableName],
        storageDocId: this.props.storageDocId(tableName),
      });
      Object.defineProperty(this, tableName, {
        get: () => table,
      });
    });
  }
}

export type WorkspaceDBWithTables<Schema extends DBSchemaBuilder> =
  WorkspaceDB<Schema> & {
    [K in keyof Schema]: WorkspaceDBTable<Schema[K]>;
  };
