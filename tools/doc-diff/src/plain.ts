import { Array as YArray, Doc, Map as YMap, Text } from 'yjs';

export type PlainValue =
  | null
  | boolean
  | number
  | string
  | PlainValue[]
  | { [key: string]: PlainValue };

export const MISSING: unique symbol = Symbol('missing');

export function toPlain(value: unknown): PlainValue {
  if (value === null) {
    return null;
  }
  switch (typeof value) {
    case 'boolean':
    case 'number':
    case 'string':
      return value;
    case 'undefined':
      return null;
  }

  if (value instanceof Text) {
    return value.toString();
  }

  if (value instanceof Doc) {
    return { __type: 'YDoc', guid: value.guid };
  }

  if (value instanceof YArray) {
    return value.toArray().map(toPlain);
  }

  if (value instanceof YMap) {
    const keys = Array.from(value.keys()).sort();
    const obj: Record<string, PlainValue> = {};
    for (const key of keys) {
      obj[key] = toPlain(value.get(key));
    }
    return obj;
  }

  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('base64');
  }

  if (Array.isArray(value)) {
    return value.map(toPlain);
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const obj: Record<string, PlainValue> = {};
    for (const key of keys) {
      obj[key] = toPlain(record[key]);
    }
    return obj;
  }

  return String(value);
}

function stableComparable(value: unknown): unknown {
  if (value === MISSING) {
    return { __missing: true };
  }
  if (value === null || typeof value !== 'object') {
    if (value === undefined) {
      return { __undefined: true };
    }
    return value;
  }
  if (value instanceof Uint8Array) {
    return { __uint8array_base64: Buffer.from(value).toString('base64') };
  }
  if (Array.isArray(value)) {
    return value.map(stableComparable);
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const obj: Record<string, unknown> = {};
  for (const key of keys) {
    obj[key] = stableComparable(record[key]);
  }
  return obj;
}

export function isEqual(a: unknown, b: unknown): boolean {
  return (
    JSON.stringify(stableComparable(a)) === JSON.stringify(stableComparable(b))
  );
}

export function truncate(s: string, maxLen = 200) {
  if (s.length <= maxLen) {
    return s;
  }
  return `${s.slice(0, Math.max(0, maxLen - 3))}...`;
}

function isLikelyTimestampKey(key: string) {
  const lower = key.toLowerCase();
  return (
    lower.endsWith('date') ||
    lower.endsWith('at') ||
    lower === 'created' ||
    lower === 'updated' ||
    lower.includes('timestamp')
  );
}

function formatTimestampMillis(ms: number) {
  if (!Number.isFinite(ms)) {
    return String(ms);
  }
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) {
    return String(ms);
  }
  return `${ms} (${date.toISOString()})`;
}

export function formatValue(key: string, value: PlainValue | typeof MISSING) {
  if (value === MISSING) {
    return '<missing>';
  }
  if (typeof value === 'number' && isLikelyTimestampKey(key)) {
    return formatTimestampMillis(value);
  }
  return truncate(JSON.stringify(value));
}
