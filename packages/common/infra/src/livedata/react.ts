import { use } from 'foxact/use';
import { useEffect, useState } from 'react';

import type { LiveData } from '.';

/**
 * subscribe LiveData and return the value.
 */
export function useLiveData<T>(liveData: LiveData<T>): T {
  const [data, setData] = useState(liveData.value);

  useEffect(() => {
    const subscription = liveData.subscribe(value => {
      setData(value);
    });
    return () => subscription.unsubscribe();
  }, [liveData]);

  return data;
}

/**
 * subscribe LiveData and return the value. If the value is nullish, will suspends until the value is not nullish.
 */
export function useEnsureLiveData<T>(liveData: LiveData<T>): NonNullable<T> {
  const data = useLiveData(liveData);

  if (data === null || data === undefined) {
    return use(
      new Promise(resolve => {
        liveData.subscribe(value => {
          if (value === null || value === undefined) {
            resolve(value);
          }
        });
      })
    );
  }

  return data;
}
