import { format } from 'date-fns/format';

export type FormulaValue =
  | number
  | string
  | boolean
  | Date
  | null
  | FormulaValue[];

export type FormulaType =
  | 'number'
  | 'text'
  | 'boolean'
  | 'date'
  | 'list'
  | 'unknown';

export class FormulaRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaRuntimeError';
  }
}

export const MAX_TEXT_LENGTH = 10000;

export const typeOfValue = (value: FormulaValue): FormulaType => {
  if (value == null) return 'unknown';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'boolean') return 'boolean';
  if (value instanceof Date) return 'date';
  return 'list';
};

export const describeType = (type: FormulaType) => {
  switch (type) {
    case 'number':
      return 'a number';
    case 'text':
      return 'text';
    case 'boolean':
      return 'a checkbox value';
    case 'date':
      return 'a date';
    case 'list':
      return 'a list';
    default:
      return 'an empty value';
  }
};

export const isEmptyValue = (value: FormulaValue): boolean => {
  if (value == null) return true;
  if (typeof value === 'string') return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'number') return Number.isNaN(value);
  if (value instanceof Date) return Number.isNaN(value.getTime());
  return false;
};

export const isTruthy = (value: FormulaValue): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0 && !Number.isNaN(value);
  return !isEmptyValue(value);
};

/**
 * Strips binary floating point noise, so `0.1 + 0.2` shows as `0.3`.
 */
export const normalizeNumber = (value: number) =>
  Number.isInteger(value) ? value : Number.parseFloat(value.toPrecision(15));

export const formatDateValue = (value: Date) => {
  const hasTime =
    value.getHours() !== 0 ||
    value.getMinutes() !== 0 ||
    value.getSeconds() !== 0;
  return format(value, hasTime ? 'yyyy/MM/dd HH:mm' : 'yyyy/MM/dd');
};

export const valueToText = (value: FormulaValue): string => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(normalizeNumber(value));
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return formatDateValue(value);
  return value.map(valueToText).join(', ');
};

export const valuesEqual = (a: FormulaValue, b: FormulaValue): boolean => {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((v, i) => valuesEqual(v, b[i] as FormulaValue))
    );
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return normalizeNumber(a) === normalizeNumber(b);
  }
  return a === b;
};

export const checkNumber = (value: number): number => {
  if (!Number.isFinite(value)) {
    throw new FormulaRuntimeError('The result is not a valid number');
  }
  return value;
};

export const checkText = (value: string): string => {
  if (value.length > MAX_TEXT_LENGTH) {
    throw new FormulaRuntimeError(
      `Text is too long (max ${MAX_TEXT_LENGTH} characters)`
    );
  }
  return value;
};

export const expectNumber = (value: FormulaValue, context: string): number => {
  if (typeof value === 'number') return value;
  if (value == null) return 0;
  throw new FormulaRuntimeError(
    `${context} expects a number but got ${describeType(typeOfValue(value))}`
  );
};

export const expectText = (value: FormulaValue, context: string): string => {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  throw new FormulaRuntimeError(
    `${context} expects text but got ${describeType(typeOfValue(value))}`
  );
};

export const expectDate = (
  value: FormulaValue,
  context: string
): Date | null => {
  if (value == null) return null;
  if (value instanceof Date) return value;
  throw new FormulaRuntimeError(
    `${context} expects a date but got ${describeType(typeOfValue(value))}`
  );
};

export const expectList = (
  value: FormulaValue,
  context: string
): FormulaValue[] => {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  throw new FormulaRuntimeError(
    `${context} expects a list but got ${describeType(typeOfValue(value))}`
  );
};
