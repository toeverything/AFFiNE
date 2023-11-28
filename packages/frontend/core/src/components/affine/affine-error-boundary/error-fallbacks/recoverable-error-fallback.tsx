import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useCallback, useMemo } from 'react';

import { RecoverableError } from '../../../../unexpected-application-state/errors';
import { ContactUS, ErrorDetail } from '../error-basic/error-detail';
import { createErrorFallback } from '../error-basic/fallback-creator';

export const RecoverableErrorFallback = createErrorFallback(
  RecoverableError,
  props => {
    const { error, resetError } = props;
    const t = useAFFiNEI18N();

    const canRetry = error.canRetry();
    const buttonDesc = useMemo(() => {
      if (canRetry) {
        return t['com.affine.error.refetch']();
      }
      return t['com.affine.error.reload']();
    }, [canRetry, t]);
    const onRetry = useCallback(async () => {
      await error.retry();
    }, [error]);

    return (
      <ErrorDetail
        title={t['com.affine.error.unexpected-error.title']()}
        resetError={resetError}
        buttonText={buttonDesc}
        onButtonClick={onRetry}
        description={[error.message, <ContactUS key="contact-us" />]}
      />
    );
  }
);
