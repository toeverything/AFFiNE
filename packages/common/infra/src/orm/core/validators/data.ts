import { pick as lodashPick } from 'lodash-es';

import type { FieldType } from '../schema';
import type { DataValidator } from './types';

function inputType(val: any) {
  return val === null ||
    Array.isArray(val) ||
    val.constructor === 'Object' ||
    !val.constructor /* Object.create(null) */
    ? 'json'
    : typeof val;
}

function typeMatches(typeWant: FieldType, typeGet: string) {
  if (typeWant === 'json') {
    switch (typeGet) {
      case 'bigint':
      case 'function':
      case 'object': // we've already converted available types into 'json'
      case 'symbol':
      case 'undefined':
        return false;
    }
  }

  return typeWant === typeGet;
}

export const dataValidators = {
  PrimaryKeyShouldExist: {
    validate(table, data) {
      const val = data[table.keyField];

      if (val === undefined || val === null) {
        throw new Error(
          `[Table(${table.name})]: Primary key field '${table.keyField}' is required but not set.`
        );
      }
    },
  },
  PrimaryKeyShouldNotBeUpdated: {
    validate(table, data) {
      if (data[table.keyField] !== undefined) {
        throw new Error(
          `[Table(${table.name})]: Primary key field '${table.keyField}' can't be updated.`
        );
      }
    },
  },
  DataTypeShouldMatch: {
    validate(table, data) {
      for (const key in data) {
        const field = table.schema[key];
        if (!field) {
          throw new Error(
            `[Table(${table.name})]: Field '${key}' is not defined but set in entity.`
          );
        }

        const val = data[key];

        if (val === undefined) {
          delete data[key];
          continue;
        }

        if (
          val === null &&
          (!field.optional ||
            field.optional) /* say 'null' can be stored as 'json' */
        ) {
          throw new Error(
            `[Table(${table.name})]: Field '${key}' is required but set as null.`
          );
        }

        const typeGet = inputType(val);
        if (!typeMatches(field.type, typeGet)) {
          throw new Error(
            `[Table(${table.name})]: Field '${key}' type mismatch. Expected ${field.type} got ${typeGet}.`
          );
        }
      }
    },
  },
  DataTypeShouldExactlyMatch: {
    validate(table, data) {
      const keys: Set<string> = new Set();
      for (const key in data) {
        const field = table.schema[key];
        if (!field) {
          throw new Error(
            `[Table(${table.name})]: Field '${key}' is not defined but set in entity.`
          );
        }

        const val = data[key];

        if ((val === undefined || val === null) && !field.optional) {
          throw new Error(
            `[Table(${table.name})]: Field '${key}' is required but not set.`
          );
        }

        const typeGet = inputType(val);
        if (!typeMatches(field.type, typeGet)) {
          throw new Error(
            `[Table(${table.name})]: Field '${key}' type mismatch. Expected type '${field.type}' but got '${typeGet}'.`
          );
        }

        keys.add(key);
      }

      for (const key in table.schema) {
        if (!keys.has(key) && table.schema[key].optional === false) {
          throw new Error(
            `[Table(${table.name})]: Field '${key}' is required but not set.`
          );
        }
      }
    },
  },
} satisfies Record<string, DataValidator>;

// lodash pick's signature is not typesafe
const pick = lodashPick as <T extends Record<string, any>>(
  obj: T,
  ...keys: Array<keyof T>
) => Pick<T, keyof T>;

export const createEntityDataValidators = pick(
  dataValidators,
  'PrimaryKeyShouldExist',
  'DataTypeShouldExactlyMatch'
);
export const updateEntityDataValidators = pick(
  dataValidators,
  'PrimaryKeyShouldNotBeUpdated',
  'DataTypeShouldMatch'
);
