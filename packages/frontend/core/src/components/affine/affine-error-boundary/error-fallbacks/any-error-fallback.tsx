import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { FC } from 'react';
import { useCallback } from 'react';

import { ErrorDetail } from '../error-basic/error-detail';
import type { FallbackProps } from '../error-basic/fallback-creator';

/**
 * TODO: Support reload and retry two reset actions in page error and area error.
 */
export const AnyErrorFallback: FC<FallbackProps> = props => {
  const { error } = props;
  const t = useAFFiNEI18N();

  const reloadPage = useCallback(() => {
    document.location.reload();
  }, []);

  return (
    <ErrorDetail
      title={t['com.affine.error.unexpected-error.title']()}
      resetError={reloadPage}
      buttonText={t['com.affine.error.reload']()}
      description={error.message ?? error.toString()}
    />
  );
};
