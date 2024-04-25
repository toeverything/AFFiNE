import type { TableSchemaBuilder } from '../schema';
import type { Table } from '../table';

export interface TableSchemaValidator {
  validate(tableName: string, schema: TableSchemaBuilder): void;
}

export interface DataValidator {
  validate(table: Table<any>, data: any): void;
}
