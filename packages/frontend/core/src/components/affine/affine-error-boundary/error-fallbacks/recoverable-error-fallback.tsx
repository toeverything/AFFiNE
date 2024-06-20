import { useI18n } from '@affine/i18n';
import { useCallback, useMemo, useState } from 'react';

import { RecoverableError } from '../../../../unexpected-application-state/errors';
import { ContactUS, ErrorDetail } from '../error-basic/error-detail';
import { createErrorFallback } from '../error-basic/fallback-creator';

export const RecoverableErrorFallback = createErrorFallback(
  RecoverableError,
  props => {
    const { error, resetError } = props;
    const t = useI18n();
    const [count, rerender] = useState(0);

    const canRetry = error.canRetry();
    const buttonDesc = useMemo(() => {
      if (canRetry) {
        return t['com.affine.error.refetch']();
      }
      return t['com.affine.error.reload']();
    }, [canRetry, t]);
    const onRetry = useCallback(async () => {
      if (canRetry) {
        rerender(count + 1);
        await error.retry();
      } else {
        document.location.reload();
      }
    }, [error, count, canRetry]);

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
