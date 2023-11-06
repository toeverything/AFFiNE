import type { ErrorInfo } from 'react';
import React, { useRef } from 'react';
import type { ErrorBoundaryProps } from 'react-error-boundary';
import { ErrorBoundary } from 'react-error-boundary';
import { useSWRConfig } from 'swr';

/**
 * If we use suspense mode in SWR, we need to preload or delete cache to retry request.
 * Or the error will be cached and the request will not be retried.
 *
 * Reference:
 * https://github.com/vercel/swr/issues/2740
 * https://github.com/vercel/swr/blob/main/core/src/use-swr.ts#L690
 * https://github.com/vercel/swr/tree/main/examples/suspense-retry
 */
export const SWRErrorBoundary = (props: ErrorBoundaryProps) => {
  const { onReset, onError } = props;
  const errorsRef = useRef<Error[]>([]);
  const { cache } = useSWRConfig();

  const clearErrorCache = React.useCallback(() => {
    const errors = errorsRef.current;
    errorsRef.current = [];

    for (const key of cache.keys()) {
      const item = cache.get(key);
      if (errors.includes(item?.error)) {
        cache.delete(key);
      }
    }
  }, [cache]);

  const onResetWithSWR = React.useCallback(
    (details: any) => {
      clearErrorCache();
      onReset?.(details);
    },
    [clearErrorCache, onReset]
  );

  const onErrorWithSWR = React.useCallback(
    (error: Error, info: ErrorInfo) => {
      errorsRef.current.push(error);
      onError?.(error, info);
    },
    [onError]
  );

  React.useEffect(() => clearErrorCache, [clearErrorCache]);

  return (
    <ErrorBoundary {...props} onReset={onResetWithSWR} onError={onErrorWithSWR}>
      {props.children}
    </ErrorBoundary>
  );
};
