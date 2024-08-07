import { type DependencyList, type SyntheticEvent } from 'react';

import { useAsyncCallback } from './affine-async-hooks';

export const useCatchEventCallback = <E extends SyntheticEvent>(
  cb: (e: E) => void | Promise<void>,
  deps: DependencyList
) => {
  return useAsyncCallback(
    async (e: E) => {
      e.stopPropagation();
      await cb(e);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );
};
