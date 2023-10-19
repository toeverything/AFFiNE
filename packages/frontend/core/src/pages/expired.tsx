import { AuthPageContainer } from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useCallback } from 'react';

import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

export const Component = () => {
  const t = useAFFiNEI18N();
  const { jumpToIndex } = useNavigateHelper();
  const onOpenAffine = useCallback(() => {
    jumpToIndex(RouteLogic.REPLACE);
  }, [jumpToIndex]);

  return (
    <AuthPageContainer
      title={t['com.affine.expired.page.title']()}
      subtitle={t['com.affine.expired.page.subtitle']()}
    >
      <Button type="primary" size="large" onClick={onOpenAffine}>
        {t['com.affine.auth.open.affine']()}
      </Button>
    </AuthPageContainer>
  );
};
