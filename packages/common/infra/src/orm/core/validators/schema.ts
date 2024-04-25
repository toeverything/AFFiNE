import type { TableSchemaValidator } from './types';

export const tableSchemaValidators: Record<string, TableSchemaValidator> = {
  PrimaryKeyShouldExist: {
    validate(tableName, table) {
      if (!Object.values(table).some(field => field.schema.isPrimaryKey)) {
        throw new Error(
          `[Table(${tableName})]: There should be at least one field marked as primary key.`
        );
      }
    },
  },
  OnlyOnePrimaryKey: {
    validate(tableName, table) {
      const primaryFields = [];

      for (const name in table) {
        if (table[name].schema.isPrimaryKey) {
          primaryFields.push(name);
        }
      }

      if (primaryFields.length > 1) {
        throw new Error(
          `[Table(${tableName})]: There should be only one field marked as primary key. Found [${primaryFields.join(', ')}].`
        );
      }
    },
  },
  PrimaryKeyShouldNotBeOptional: {
    validate(tableName, table) {
      for (const name in table) {
        const opts = table[name].schema;
        if (opts.isPrimaryKey && opts.optional && !opts.default) {
          throw new Error(
            `[Table(${tableName})]: Field '${name}' can't be marked primary key and optional with no default value provider at the same time.`
          );
        }
      }
    },
  },
};
