import { useCallback } from 'react';
import { useSWRConfig } from 'swr';

export function useMutateCloud() {
  const { mutate } = useSWRConfig();
  return useCallback(async () => {
    return mutate(key => {
      if (Array.isArray(key)) {
        return key[0] === 'cloud';
      }
      return false;
    });
  }, [mutate]);
}
