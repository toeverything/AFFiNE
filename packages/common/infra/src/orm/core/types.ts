import type { TableSchemaBuilder } from './schema';

export interface Key {
  toString(): string;
}

export interface TableOptions {
  schema: TableSchemaBuilder;
}
