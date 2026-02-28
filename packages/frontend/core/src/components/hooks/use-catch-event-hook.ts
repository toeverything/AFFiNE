import { type DependencyList, type SyntheticEvent } from 'react';

import { useAsyncCallback } from './affine-async-hooks';

export const useCatchEventCallback = <
  E extends SyntheticEvent,
  Args extends any[],
>(
  cb: (e: E, ...args: Args) => void | Promise<void>,
  deps: DependencyList
) => {
  return useAsyncCallback(
    async (e: E, ...args: Args) => {
      e.stopPropagation();
      await cb(e, ...args);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );
};
