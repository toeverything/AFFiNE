import type { Doc } from 'yjs';

import type { DBSchemaBuilder } from '../../schema';
import { validators } from '../../validators';
import type { DBAdapter, TableAdapter } from '../types';
import { YjsTableAdapter } from './table';

export interface DocProvider {
  getDoc(guid: string): Doc;
}

export class YjsDBAdapter implements DBAdapter {
  tables: Map<string, TableAdapter> = new Map();
  constructor(private readonly provider: DocProvider) {}

  connect(db: DBSchemaBuilder): Promise<void> {
    for (const [tableName, table] of Object.entries(db)) {
      validators.validateYjsTableSchema(tableName, table);
      const doc = this.provider.getDoc(tableName);

      this.tables.set(tableName, new YjsTableAdapter(tableName, doc));
    }

    return Promise.resolve();
  }

  disconnect(_db: DBSchemaBuilder): Promise<void> {
    this.tables.forEach(table => {
      table.dispose();
    });
    this.tables.clear();
    return Promise.resolve();
  }

  table(tableName: string) {
    const table = this.tables.get(tableName);

    if (!table) {
      throw new Error('Table not found');
    }

    return table;
  }
}
