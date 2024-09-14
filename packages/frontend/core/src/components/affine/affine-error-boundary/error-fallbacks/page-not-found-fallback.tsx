import { PageNotFoundError } from '@affine/env/constant';
import { useI18n } from '@affine/i18n';
import { useCallback } from 'react';

import {
  RouteLogic,
  useNavigateHelper,
} from '../../../../components/hooks/use-navigate-helper';
import { ErrorDetail, ErrorStatus } from '../error-basic/error-detail';
import { createErrorFallback } from '../error-basic/fallback-creator';

export const PageNotFoundDetail = createErrorFallback(PageNotFoundError, () => {
  const t = useI18n();
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
