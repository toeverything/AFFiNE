import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { FC } from 'react';

import { ErrorDetail } from '../error-basic/error-detail';
import type { FallbackProps } from '../error-basic/fallback-creator';

export const AnyErrorFallback: FC<FallbackProps> = props => {
  const { error, resetError } = props;
  const t = useAFFiNEI18N();

  return (
    <ErrorDetail
      title={t['com.affine.notFoundPage.title']()}
      resetError={resetError}
      description={<code>{error.message ?? error.toString()}</code>}
    />
  );
};
