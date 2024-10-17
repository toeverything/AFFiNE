import type { FieldType } from './field-type';

export type Schema = Record<
  string,
  | FieldType
  | {
      type: FieldType;
      /**
       * If false, the field will not be indexed, and thus not searchable.
       *
       * default: true
       */
      index?: boolean;
      /**
       * If false, the field will not be stored, and not included in the search result.
       *
       * default: true
       */
      store?: boolean;
    }
>;

export function defineSchema<T extends Schema>(schema: T): T {
  return schema;
}
