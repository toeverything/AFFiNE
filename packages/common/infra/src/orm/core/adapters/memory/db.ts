import type { DBSchemaBuilder } from '../../schema';
import type { DBAdapter } from '../types';
import { MemoryTableAdapter } from './table';

export class MemoryORMAdapter implements DBAdapter {
  connect(_db: DBSchemaBuilder): Promise<void> {
    return Promise.resolve();
  }

  disconnect(_db: DBSchemaBuilder): Promise<void> {
    return Promise.resolve();
  }

  table(tableName: string) {
    return new MemoryTableAdapter(tableName);
  }
}
