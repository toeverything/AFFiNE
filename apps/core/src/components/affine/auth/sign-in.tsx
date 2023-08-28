import { AuthInput, ModalHeader } from '@affine/component/auth-components';
import { pushNotificationAtom } from '@affine/component/notification-center';
import type { Notification } from '@affine/component/notification-center/index.jotai';
import { getUserQuery } from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { ArrowDownBigIcon, GoogleDuotoneIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { useSetAtom } from 'jotai';
import { signIn, type SignInResponse } from 'next-auth/react';
import { type FC, useState } from 'react';
import { useCallback } from 'react';

import { emailRegex } from '../../../utils/email-regex';
import { buildCallbackUrl } from './callback-url';
import type { AuthPanelProps } from './index';
import * as style from './style.css';

function validateEmail(email: string) {
  return emailRegex.test(email);
}

function handleSendEmailError(
  res: SignInResponse | undefined,
  pushNotification: (notification: Notification) => void
) {
  if (res?.error) {
    pushNotification({
      title: 'Send email error',
      message: 'Please back to home and try again',
      type: 'error',
    });
  }
}

export const SignIn: FC<AuthPanelProps> = ({
  setAuthState,
  setAuthEmail,
  email,
}) => {
  const t = useAFFiNEI18N();

  const { trigger: verifyUser, isMutating } = useMutation({
    mutation: getUserQuery,
  });
  const [isValidEmail, setIsValidEmail] = useState(true);
  const pushNotification = useSetAtom(pushNotificationAtom);
  const onContinue = useCallback(async () => {
    if (!validateEmail(email)) {
      setIsValidEmail(false);
      return;
    }

    setIsValidEmail(true);
    const { user } = await verifyUser({ email });

    setAuthEmail(email);
    if (user) {
      signIn('email', {
        email: email,
        callbackUrl: buildCallbackUrl('signIn'),
        redirect: false,
      })
        .then(res => handleSendEmailError(res, pushNotification))
        .catch(console.error);
      setAuthState('afterSignInSendEmail');
    } else {
      signIn('email', {
        email: email,
        callbackUrl: buildCallbackUrl('signUp'),
        redirect: false,
      })
        .then(res => handleSendEmailError(res, pushNotification))
        .catch(console.error);

      setAuthState('afterSignUpSendEmail');
    }
  }, [email, setAuthEmail, setAuthState, verifyUser, pushNotification]);
  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['AFFiNE Cloud']()}
      />

      <Button
        type="primary"
        block
        size="extraLarge"
        style={{
          marginTop: 30,
        }}
        icon={<GoogleDuotoneIcon />}
        onClick={useCallback(() => {
          signIn('google').catch(console.error);
        }, [])}
      >
        {t['Continue with Google']()}
      </Button>

      <div className={style.authModalContent}>
        <AuthInput
          label={t['com.affine.settings.email']()}
          placeholder={t['com.affine.auth.sign.email.placeholder']()}
          value={email}
          onChange={useCallback(
            (value: string) => {
              setAuthEmail(value);
            },
            [setAuthEmail]
          )}
          error={!isValidEmail}
          errorHint={
            isValidEmail ? '' : t['com.affine.auth.sign.email.error']()
          }
          onEnter={onContinue}
        />

        <Button
          size="extraLarge"
          data-testid="continue-login-button"
          block
          loading={isMutating}
          icon={
            <ArrowDownBigIcon
              width={20}
              height={20}
              style={{
                transform: 'rotate(-90deg)',
                color: 'var(--affine-blue)',
              }}
            />
          }
          iconPosition="end"
          onClick={onContinue}
        >
          {t['com.affine.auth.sign.email.continue']()}
        </Button>

        <div className={style.authMessage}>
          {/*prettier-ignore*/}
          <Trans i18nKey="com.affine.auth.sign.message">
              By clicking &quot;Continue with Google/Email&quot; above, you acknowledge that
              you agree to AFFiNE&apos;s <a href="https://affine.pro/terms" target="_blank" rel="noreferrer">Terms of Conditions</a> and <a href="https://affine.pro/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
            </Trans>
        </div>
      </div>
    </>
  );
};
