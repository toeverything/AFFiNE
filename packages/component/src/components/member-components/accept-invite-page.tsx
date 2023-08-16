import { AuthPageContainer } from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import type { FC } from 'react';

export const AcceptInvitePage: FC<{
  onOpenAffine: () => void;
}> = ({ onOpenAffine }) => {
  const t = useAFFiNEI18N();
  return (
    <AuthPageContainer title={t['Successfully joined!']()} subtitle="">
      <Button type="primary" size="large" onClick={onOpenAffine}>
        {t['Visit Workspace']()}
      </Button>
    </AuthPageContainer>
  );
};
