import type { TableSchemaValidator } from './types';

const PRESERVED_FIELDS = ['$$DELETED'];

interface DataValidator {
  validate(tableName: string, data: any): void;
}

export const yjsTableSchemaValidators: Record<string, TableSchemaValidator> = {
  UsePreservedFields: {
    validate(tableName, table) {
      for (const name in table) {
        if (PRESERVED_FIELDS.includes(name)) {
          throw new Error(
            `[Table(${tableName})]: Field '${name}' is reserved keyword and can't be used.`
          );
        }
      }
    },
  },
};

export const yjsDataValidators: Record<string, DataValidator> = {
  SetPreservedFields: {
    validate(tableName, data) {
      for (const name of PRESERVED_FIELDS) {
        if (data[name] !== undefined) {
          throw new Error(
            `[Table(${tableName})]: Field '${name}' is reserved keyword and can't be set.`
          );
        }
      }
    },
  },
};
