import { debounce } from 'lodash-es';
import { useEffect, useMemo, useRef } from 'react';

export const useDebounceCallback = <T extends (...args: any[]) => any>(
  callback: T,
  delay?: number,
  options?: Parameters<typeof debounce>[2]
) => {
  const callbackRef = useRef(callback);

  const debouncedCallback = useMemo(
    () => debounce(callbackRef.current, delay, options),
    [delay, options]
  );

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      debouncedCallback.cancel();
    };
  }, [debouncedCallback]);

  return debouncedCallback;
};
