import { Wrapper } from '@affine/component';
import {
  AuthInput,
  BackButton,
  ModalHeader,
} from '@affine/component/auth-components';
import { pushNotificationAtom } from '@affine/component/notification-center';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useSetAtom } from 'jotai';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useSession } from 'next-auth/react';
import type { FC } from 'react';
import { useCallback, useState } from 'react';

import { signInCloud } from '../../../utils/cloud-utils';
import type { AuthPanelProps } from './index';
import { forgetPasswordButton } from './style.css';

export const SignInWithPassword: FC<AuthPanelProps> = ({
  setAuthState,
  email,
  onSignedIn,
}) => {
  const t = useAFFiNEI18N();
  const { update } = useSession();

  const pushNotification = useSetAtom(pushNotificationAtom);

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  const onSignIn = useCallback(async () => {
    const res = await signInCloud('credentials', {
      redirect: false,
      email,
      password,
    }).catch(console.error);

    if (!res?.ok) {
      return setPasswordError(true);
    }

    await update();
    onSignedIn?.();
    pushNotification({
      title: `${email}${t['com.affine.auth.has.signed']()}`,
      message: '',
      key: Date.now().toString(),
      type: 'success',
    });
  }, [email, password, pushNotification, onSignedIn, t, update]);

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
          value={email}
        />
        <AuthInput
          data-testid="password-input"
          label={t['com.affine.auth.password']()}
          value={password}
          type="password"
          onChange={useCallback((value: string) => {
            setPassword(value);
          }, [])}
          error={passwordError}
          errorHint={t['com.affine.auth.password.error']()}
          onEnter={onSignIn}
        />
        <span></span>
        <button
          className={forgetPasswordButton}
          // onClick={useCallback(() => {
          //   setAuthState('sendPasswordEmail');
          // }, [setAuthState])}
        >
          {t['com.affine.auth.forget']()}
        </button>
      </Wrapper>
      <Button
        data-testid="sign-in-button"
        type="primary"
        size="extraLarge"
        style={{ width: '100%' }}
        onClick={onSignIn}
      >
        {t['com.affine.auth.sign.in']()}
      </Button>

      <BackButton
        onClick={useCallback(() => {
          setAuthState('afterSignInSendEmail');
        }, [setAuthState])}
      />
    </>
  );
};
