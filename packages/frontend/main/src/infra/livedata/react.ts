import { use } from 'foxact/use';
import { useSyncExternalStore } from 'react';

import type { LiveData } from './index';

/**
 * subscribe LiveData and return the value.
 */
export function useLiveData<T>(liveData: LiveData<T>): T {
  return useSyncExternalStore(
    liveData.reactSubscribe,
    liveData.reactGetSnapshot
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
