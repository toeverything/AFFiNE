import { ErrorBoundary } from '@sentry/react';
import type { FC, PropsWithChildren } from 'react';
import { useCallback } from 'react';

import { AffineErrorFallback } from './affine-error-fallback';
import type { FallbackProps } from './error-basic/fallback-creator';

export { type FallbackProps } from './error-basic/fallback-creator';

export interface AffineErrorBoundaryProps extends PropsWithChildren {
  height?: number | string;
}

/**
 * TODO: Unify with SWRErrorBoundary
 */
export const AffineErrorBoundary: FC<AffineErrorBoundaryProps> = props => {
  const fallbackRender = useCallback(
    (fallbackProps: FallbackProps) => {
      return <AffineErrorFallback {...fallbackProps} height={props.height} />;
    },
    [props.height]
  );

  const onError = useCallback((error: Error, componentStack: string) => {
    console.error('Uncaught error:', error, componentStack);
  }, []);

  return (
    <ErrorBoundary fallback={fallbackRender} onError={onError}>
      {props.children}
    </ErrorBoundary>
  );
};
