import type { DBAdapter } from '../types';
import { MemoryTableAdapter } from './table';

export class MemoryORMAdapter implements DBAdapter {
  table(tableName: string) {
    return new MemoryTableAdapter(tableName);
  }
}
