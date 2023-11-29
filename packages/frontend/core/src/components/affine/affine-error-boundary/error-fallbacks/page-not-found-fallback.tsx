import { PageNotFoundError } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useCallback } from 'react';

import {
  RouteLogic,
  useNavigateHelper,
} from '../../../../hooks/use-navigate-helper';
import { ErrorDetail, ErrorStatus } from '../error-basic/error-detail';
import { createErrorFallback } from '../error-basic/fallback-creator';

export const PageNotFoundDetail = createErrorFallback(PageNotFoundError, () => {
  const t = useAFFiNEI18N();
  const { jumpToIndex } = useNavigateHelper();

  const onBtnClick = useCallback(
    () => jumpToIndex(RouteLogic.REPLACE),
    [jumpToIndex]
  );

  return (
    <ErrorDetail
      title={t['com.affine.notFoundPage.title']()}
      description={t['404.hint']()}
      buttonText={t['404.back']()}
      onButtonClick={onBtnClick}
      status={ErrorStatus.NotFound}
    />
  );
});
