import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { FC } from 'react';

import { Button } from '../../ui/button';
import { AuthPageContainer } from './auth-page-container';

export const ConfirmChangeEmail: FC<{
  onOpenAffine: () => void;
}> = ({ onOpenAffine }) => {
  const t = useAFFiNEI18N();

  return (
    <AuthPageContainer
      title={t['com.affine.auth.change.email.page.success.title']()}
      subtitle={t['com.affine.auth.change.email.page.success.subtitle']()}
    >
      <Button type="primary" size="large" onClick={onOpenAffine}>
        {t['com.affine.auth.open.affine']()}
      </Button>
    </AuthPageContainer>
  );
};
