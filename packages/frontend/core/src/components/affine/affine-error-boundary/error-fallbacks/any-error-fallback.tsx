import { useI18n } from '@affine/i18n';
import type { FC } from 'react';
import { useCallback } from 'react';

import { ErrorDetail } from '../error-basic/error-detail';
import type { FallbackProps } from '../error-basic/fallback-creator';

/**
 * TODO(@eyhn): Support reload and retry two reset actions in page error and area error.
 */
export const AnyErrorFallback: FC<FallbackProps> = props => {
  const { error } = props;
  const t = useI18n();

  const reloadPage = useCallback(() => {
    document.location.reload();
  }, []);

  return (
    <ErrorDetail
      title={t['com.affine.error.unexpected-error.title']()}
      resetError={reloadPage}
      buttonText={t['com.affine.error.reload']()}
      description={
        'message' in (error as Error) ? (error as Error).message : `${error}`
      }
      error={error as Error}
    />
  );
};
