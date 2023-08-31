import {
  AuthInput,
  CountDownRender,
  ModalHeader,
} from '@affine/component/auth-components';
import { getUserQuery } from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { ArrowDownBigIcon, GoogleDuotoneIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { type FC, useState } from 'react';
import { useCallback } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import { emailRegex } from '../../../utils/email-regex';
import type { AuthPanelProps } from './index';
import * as style from './style.css';
import { useAuth } from './use-auth';

function validateEmail(email: string) {
  return emailRegex.test(email);
}

export const SignIn: FC<AuthPanelProps> = ({
  setAuthState,
  setAuthEmail,
  email,
  onSignedIn,
}) => {
  const t = useAFFiNEI18N();
  const loginStatus = useCurrentLoginStatus();

  const { resendCountDown, allowSendEmail, signIn, signUp, signInWithGoogle } =
    useAuth({
      onNoAccess: useCallback(() => {
        setAuthState('noAccess');
      }, [setAuthState]),
    });

  const { trigger: verifyUser, isMutating } = useMutation({
    mutation: getUserQuery,
  });
  const [isValidEmail, setIsValidEmail] = useState(true);

  if (loginStatus === 'authenticated') {
    onSignedIn?.();
  }

  const onContinue = useCallback(async () => {
    if (!validateEmail(email)) {
      setIsValidEmail(false);
      return;
    }

    setIsValidEmail(true);
    const { user } = await verifyUser({ email });

    setAuthEmail(email);
    if (user) {
      setAuthState('afterSignInSendEmail');

      await signIn(email);
    } else {
      setAuthState('afterSignUpSendEmail');

      await signUp(email);
    }
  }, [email, setAuthEmail, setAuthState, signIn, signUp, verifyUser]);

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
        onClick={useCallback(async () => {
          await signInWithGoogle();
        }, [signInWithGoogle])}
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
          disabled={!allowSendEmail}
          icon={
            allowSendEmail || isMutating ? (
              <ArrowDownBigIcon
                width={20}
                height={20}
                style={{
                  transform: 'rotate(-90deg)',
                  color: 'var(--affine-blue)',
                }}
              />
            ) : (
              <CountDownRender
                className={style.resendCountdownInButton}
                timeLeft={resendCountDown}
              />
            )
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
