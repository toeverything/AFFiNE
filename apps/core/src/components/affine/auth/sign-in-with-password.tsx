import { Button, Wrapper } from '@affine/component';
import {
  AuthInput,
  BackButton,
  ModalHeader,
} from '@affine/component/auth-components';
import { pushNotificationAtom } from '@affine/component/notification-center';
import { signInMutation } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { useSetAtom } from 'jotai';
import type { FC } from 'react';
import { useCallback, useState } from 'react';

import type { AuthPanelProps } from './index';
import { forgetPasswordButton } from './style.css';

export const SignInWithPassword: FC<AuthPanelProps> = ({
  setAuthState,
  authStore: { currentEmail },
  setOpen,
}) => {
  const t = useAFFiNEI18N();
  const { trigger: sigInWithPassword } = useMutation({
    mutation: signInMutation,
  });
  const pushNotification = useSetAtom(pushNotificationAtom);

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['AFFiNE Cloud']()}
      />

      <Wrapper
        marginTop={30}
        marginBottom={50}
        style={{
          position: 'relative',
        }}
      >
        <AuthInput
          label={t['com.affine.settings.email']()}
          disabled={true}
          value={currentEmail}
        />
        <AuthInput
          label={t['com.affine.auth.password']()}
          value={password}
          type="password"
          onChange={useCallback((value: string) => {
            setPassword(value);
          }, [])}
          error={passwordError}
          errorHint={t['com.affine.auth.password.error']()}
        />
        <span></span>
        <button
          className={forgetPasswordButton}
          onClick={useCallback(() => {
            setAuthState('sendPasswordEmail');
          }, [setAuthState])}
        >
          {t['com.affine.auth.forget']()}
        </button>
      </Wrapper>
      <Button
        type="primary"
        size="extraLarge"
        style={{ width: '100%' }}
        onClick={useCallback(async () => {
          const res = await sigInWithPassword({
            email: currentEmail,
            password,
          });

          if (!res?.signIn?.token?.token) {
            setPasswordError(true);
            return;
          }

          pushNotification({
            title: `${currentEmail}${t['com.affine.auth.has.signed']()}`,
            message: '',
            key: Date.now().toString(),
            type: 'success',
          });

          setOpen(false);
        }, [
          currentEmail,
          password,
          pushNotification,
          setOpen,
          sigInWithPassword,
          t,
        ])}
      >
        {t['com.affine.auth.sign.in']()}
      </Button>

      <BackButton
        onClick={useCallback(() => {
          setAuthState('signIn');
        }, [setAuthState])}
      />
    </>
  );
};
