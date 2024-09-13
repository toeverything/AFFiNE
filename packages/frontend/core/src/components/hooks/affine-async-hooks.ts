import React, { type DependencyList } from 'react';

export type AsyncErrorHandler = (error: Error) => void;

/**
 * App should provide a global error handler for async callback in the root.
 */
export const AsyncCallbackContext = React.createContext<AsyncErrorHandler>(
  e => {
    console.error(e);
  }
);

/**
 * Translate async function to sync function and handle error automatically.
 * Only accept void function, return data here is meaningless.
 */
export function useAsyncCallback<T extends any[]>(
  callback: (...args: T) => Promise<void>,
  deps: DependencyList
): (...args: T) => void {
  const handleAsyncError = React.useContext(AsyncCallbackContext);
  return React.useCallback(
    (...args: any) => {
      callback(...args).catch(e => handleAsyncError(e));
    },
    [...deps] // eslint-disable-line react-hooks/exhaustive-deps
  );
}
