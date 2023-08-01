import type { GetCurrentUserQuery } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { FC } from 'react';
import { useCallback, useState } from 'react';

import { Button } from '../../ui/button';
import { AuthPageContainer } from './auth-page-container';
import { SetPassword } from './set-password';

export type User = Omit<GetCurrentUserQuery['currentUser'], '__typename'>;

export const SignUpPage: FC<{
  user: User;
  onSetPassword: (password: string) => void;
  onOpenAffine: () => void;
}> = ({ user: { email }, onSetPassword: propsOnSetPassword, onOpenAffine }) => {
  const t = useAFFiNEI18N();
  const [hasSetUp, setHasSetUp] = useState(false);

  const onSetPassword = useCallback(
    (passWord: string) => {
      propsOnSetPassword(passWord);
      setHasSetUp(true);
    },
    [propsOnSetPassword]
  );
  const onLater = useCallback(() => {
    setHasSetUp(true);
  }, []);

  return (
    <AuthPageContainer
      title={
        hasSetUp
          ? t['com.affine.auth.sign.up.success.title']()
          : t['com.affine.auth.page.sent.email.title']()
      }
      subtitle={
        hasSetUp ? (
          t['com.affine.auth.sign.up.success.subtitle']()
        ) : (
          <>
            {t['com.affine.auth.page.sent.email.subtitle']()}
            <a href={`mailto:${email}`}>{email}</a>
          </>
        )
      }
    >
      {hasSetUp ? (
        <Button type="primary" size="large" onClick={onOpenAffine}>
          {t['com.affine.auth.open.affine']()}
        </Button>
      ) : (
        <SetPassword
          onSetPassword={onSetPassword}
          onLater={onLater}
          confirmButtonContent={t['com.affine.auth.create.count']()}
          showLater={true}
        />
      )}
    </AuthPageContainer>
  );
};
