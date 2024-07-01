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
  constructor(
    db: DBSchemaBuilder,
    private readonly provider: DocProvider
  ) {
    for (const [tableName, table] of Object.entries(db)) {
      validators.validateYjsTableSchema(tableName, table);
      const doc = this.provider.getDoc(tableName);

      this.tables.set(tableName, new YjsTableAdapter(tableName, doc));
    }
  }

  table(tableName: string) {
    const table = this.tables.get(tableName);

    if (!table) {
      throw new Error('Table not found');
    }

    return table;
  }
}
