export type FieldType = 'string' | 'number' | 'boolean' | 'json';

export interface FieldSchema<Type = unknown> {
  type: FieldType;
  optional: boolean;
  isPrimaryKey: boolean;
  default?: () => Type;
}

export type TableSchema = Record<string, FieldSchema>;
export type TableSchemaBuilder = Record<
  string,
  FieldSchemaBuilder<any, boolean>
>;
export type DBSchemaBuilder = Record<string, TableSchemaBuilder>;

export class FieldSchemaBuilder<
  Type = unknown,
  Optional extends boolean = false,
  PrimaryKey extends boolean = false,
> {
  schema: FieldSchema = {
    type: 'string',
    optional: false,
    isPrimaryKey: false,
    default: undefined,
  };

  constructor(type: FieldType) {
    this.schema.type = type;
  }

  optional() {
    this.schema.optional = true;
    return this as FieldSchemaBuilder<Type, true, PrimaryKey>;
  }

  default(value: () => Type) {
    this.schema.default = value;
    this.schema.optional = true;
    return this as FieldSchemaBuilder<Type, true, PrimaryKey>;
  }

  primaryKey() {
    this.schema.isPrimaryKey = true;
    return this as FieldSchemaBuilder<Type, Optional, true>;
  }
}

export const f = {
  string: () => new FieldSchemaBuilder<string>('string'),
  number: () => new FieldSchemaBuilder<number>('number'),
  boolean: () => new FieldSchemaBuilder<boolean>('boolean'),
  json: <T = any>() => new FieldSchemaBuilder<T>('json'),
} satisfies Record<FieldType, () => FieldSchemaBuilder<any>>;
