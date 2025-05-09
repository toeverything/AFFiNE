import type { Array as YArray, Map as YMap } from 'yjs';

export type UnRecord = Record<string, unknown>;

export type Native2Y<T> =
  T extends Record<string, infer U>
    ? YMap<U>
    : T extends Array<infer U>
      ? YArray<U>
      : T;

export type TransformOptions = {
  deep?: boolean;
  transform?: (value: unknown, origin: unknown) => unknown;
};

export type ProxyOptions<T> = {
  onChange?: (data: T, isLocal: boolean) => void;
};
