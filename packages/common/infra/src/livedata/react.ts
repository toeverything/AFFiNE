import { useSyncExternalStore } from 'react';

import type { LiveData } from './livedata';

function noopSubscribe() {
  return () => {};
}

function nullGetSnapshot() {
  return null;
}

function undefinedGetSnapshot() {
  return undefined;
}

/**
 * subscribe LiveData and return the value.
 */
export function useLiveData<Input extends LiveData<any> | null | undefined>(
  liveData: Input
): NonNullable<Input> extends LiveData<infer T>
  ? Input extends undefined
    ? T | undefined
    : Input extends null
      ? T | null
      : T
  : never {
  return useSyncExternalStore(
    liveData ? liveData.reactSubscribe : noopSubscribe,
    liveData
      ? liveData.reactGetSnapshot
      : liveData === undefined
        ? undefinedGetSnapshot
        : nullGetSnapshot
  );
}
