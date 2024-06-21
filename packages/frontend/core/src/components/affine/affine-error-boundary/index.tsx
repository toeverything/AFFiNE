import { ErrorBoundary, type FallbackRender } from '@sentry/react';
import type { FC, PropsWithChildren } from 'react';
import { useCallback } from 'react';

import { AffineErrorFallback } from './affine-error-fallback';

export { type FallbackProps } from './error-basic/fallback-creator';

export interface AffineErrorBoundaryProps extends PropsWithChildren {
  height?: number | string;
}

/**
 * TODO(@eyhn): Unify with SWRErrorBoundary
 */
export const AffineErrorBoundary: FC<AffineErrorBoundaryProps> = props => {
  const fallbackRender: FallbackRender = useCallback(
    fallbackProps => {
      return <AffineErrorFallback {...fallbackProps} height={props.height} />;
    },
    [props.height]
  );

  const onError = useCallback((error: unknown, componentStack?: string) => {
    console.error('Uncaught error:', error, componentStack);
  }, []);

  return (
    <ErrorBoundary fallback={fallbackRender} onError={onError}>
      {props.children}
    </ErrorBoundary>
  );
};
