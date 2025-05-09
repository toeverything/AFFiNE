import { SYS_KEYS } from '../../consts';
import { Boxed } from '../boxed';
import { Text } from '../text';
import type { UnRecord } from '../types';

export const keyWithoutPrefix = (key: string) => key.replace(/(prop|sys):/, '');

export const keyWithPrefix = (key: string) =>
  SYS_KEYS.has(key) ? `sys:${key}` : `prop:${key}`;

const proxySymbol = Symbol('proxy');

export function isProxy(value: unknown): boolean {
  return proxySymbol in Object.getPrototypeOf(value);
}

export function markProxy(value: UnRecord): UnRecord {
  Object.setPrototypeOf(value, {
    [proxySymbol]: true,
  });
  return value;
}

export function isEmptyObject(obj: UnRecord): boolean {
  return Object.keys(obj).length === 0;
}

export function deleteEmptyObject(
  obj: UnRecord,
  key: string,
  parent: UnRecord
): void {
  if (isEmptyObject(obj)) {
    delete parent[key];
  }
}

export function getFirstKey(key: string): string {
  const result = key.split('.').at(0);
  if (!result) {
    throw new Error(`Invalid key for: ${key}`);
  }
  return result;
}

export function bindOnChangeIfNeed(value: unknown, onChange: () => void): void {
  if (value instanceof Text || Boxed.is(value)) {
    value.bind(onChange);
  }
}
