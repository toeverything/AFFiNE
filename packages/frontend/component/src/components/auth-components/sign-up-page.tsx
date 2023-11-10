import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useSetAtom } from 'jotai';
import type { FC } from 'react';
import { useCallback, useState } from 'react';

import { pushNotificationAtom } from '../notification-center';
import { AuthPageContainer } from './auth-page-container';
import { SetPassword } from './set-password';
type User = {
  id: string;
  name: string;
  email: string;
  image: string;
};

export const SignUpPage: FC<{
  user: User;
  onSetPassword: (password: string) => Promise<void>;
  openButtonText?: string;
  onOpenAffine: () => void;
}> = ({
  user: { email },
  onSetPassword: propsOnSetPassword,
  onOpenAffine,
  openButtonText,
}) => {
  const t = useAFFiNEI18N();
  const [hasSetUp, setHasSetUp] = useState(false);
  const pushNotification = useSetAtom(pushNotificationAtom);

  const onSetPassword = useCallback(
    (passWord: string) => {
      propsOnSetPassword(passWord)
        .then(() => setHasSetUp(true))
        .catch(e =>
          pushNotification({
            title: t['com.affine.auth.password.set-failed'](),
            message: String(e),
            key: Date.now().toString(),
            type: 'error',
          })
        );
    },
    [propsOnSetPassword, pushNotification, t]
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
          {openButtonText ?? t['com.affine.auth.open.affine']()}
        </Button>
      ) : (
        <SetPassword
          onSetPassword={onSetPassword}
          onLater={onLater}
          showLater={true}
        />
      )}
    </AuthPageContainer>
  );
};
