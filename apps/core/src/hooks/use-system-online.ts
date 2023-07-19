import { useCallback, useSyncExternalStore } from 'react';

const getOnLineStatus = () =>
  typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean'
    ? navigator.onLine
    : true;

export function useSystemOnline(): boolean {
  return useSyncExternalStore(
    useCallback(onStoreChange => {
      window.addEventListener('online', onStoreChange);
      window.addEventListener('offline', onStoreChange);
      return () => {
        window.removeEventListener('online', onStoreChange);
        window.removeEventListener('offline', onStoreChange);
      };
    }, []),
    useCallback(() => getOnLineStatus(), []),
    useCallback(() => true, [])
  );
}
