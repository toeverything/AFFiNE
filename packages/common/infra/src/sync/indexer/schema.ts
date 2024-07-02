import type { FieldType } from './field-type';

export type Schema = Record<string, FieldType>;

export function defineSchema<T extends Schema>(schema: T): T {
  return schema;
}
