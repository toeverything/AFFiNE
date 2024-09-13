import { getCurrentStore } from '@toeverything/infra';
import { Provider } from 'jotai/react';
import type { FC } from 'react';
import { useMemo } from 'react';

import * as styles from './affine-error-fallback.css';
import type { FallbackProps } from './error-basic/fallback-creator';
import { ERROR_REFLECT_KEY } from './error-basic/fallback-creator';
import { DumpInfo } from './error-basic/info-logger';
import { AnyErrorFallback } from './error-fallbacks/any-error-fallback';
import { NoPageRootFallback } from './error-fallbacks/no-page-root-fallback';
import { PageNotFoundDetail } from './error-fallbacks/page-not-found-fallback';

/**
 * Register all fallback components here.
 * If have new one just add it to the set.
 */
const fallbacks = new Set([PageNotFoundDetail, NoPageRootFallback]);

function getErrorFallbackComponent(error: any): FC<FallbackProps> {
  for (const Component of fallbacks) {
    const ErrorConstructor = Reflect.get(Component, ERROR_REFLECT_KEY);
    if (ErrorConstructor && error instanceof ErrorConstructor) {
      return Component as FC<FallbackProps>;
    }
  }
  return AnyErrorFallback;
}

export interface AffineErrorFallbackProps extends FallbackProps {
  height?: number | string;
}

export const AffineErrorFallback: FC<AffineErrorFallbackProps> = props => {
  const { error, resetError, height } = props;
  const Component = useMemo(() => getErrorFallbackComponent(error), [error]);

  return (
    <div className={styles.viewport} style={{ height }}>
      <Component error={error} resetError={resetError} />
      <Provider key="JotaiProvider" store={getCurrentStore()}>
        <DumpInfo error={error} />
      </Provider>
    </div>
  );
};
