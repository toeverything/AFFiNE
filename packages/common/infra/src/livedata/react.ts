import { use } from 'foxact/use';
import { useSyncExternalStore } from 'react';

import type { LiveData } from './index';

function noopSubscribe() {
  return () => {};
}

function noopGetSnapshot() {
  return null;
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
    liveData ? liveData.reactGetSnapshot : noopGetSnapshot
  );
}

/**
 * subscribe LiveData and return the value. If the value is nullish, will suspends until the value is not nullish.
 */
export function useEnsureLiveData<T>(liveData: LiveData<T>): NonNullable<T> {
  const data = useLiveData(liveData);

  if (data === null || data === undefined) {
    return use(
      new Promise((resolve, reject) => {
        const subscription = liveData.subscribe({
          next(value) {
            if (value === null || value === undefined) {
              resolve(value);
              subscription.unsubscribe();
            }
          },
          error(err) {
            reject(err);
          },
          complete() {
            reject(new Error('Unexpected completion'));
          },
        });
      })
    );
  }

  return data;
}
