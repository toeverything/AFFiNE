import type { YOctoDocSession } from '../../../../y-octo-session';
import type { DBSchemaBuilder } from '../../schema';
import { validators } from '../../validators';
import type { DBAdapter, TableAdapter } from '../types';
import { YOctoTableAdapter } from './table';

export interface YOctoDocProvider {
  getDoc(guid: string): YOctoDocSession;
}

export class YOctoDBAdapter implements DBAdapter {
  tables: Map<string, TableAdapter> = new Map();

  constructor(
    db: DBSchemaBuilder,
    private readonly provider: YOctoDocProvider
  ) {
    for (const [tableName, table] of Object.entries(db)) {
      validators.validateYjsTableSchema(tableName, table);
      const doc = this.provider.getDoc(tableName);

      this.tables.set(tableName, new YOctoTableAdapter(tableName, doc));
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
