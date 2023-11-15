import {
  AuthInput,
  CountDownRender,
  ModalHeader,
} from '@affine/component/auth-components';
import { type GetUserQuery, getUserQuery } from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { ArrowDownBigIcon, GoogleDuotoneIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { GraphQLError } from 'graphql';
import { type FC, useState } from 'react';
import { useCallback } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import { emailRegex } from '../../../utils/email-regex';
import type { AuthPanelProps } from './index';
import * as style from './style.css';
import { INTERNAL_BETA_URL, useAuth } from './use-auth';
import { Captcha, useCaptcha } from './use-captcha';

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
  const [verifyToken, challenge] = useCaptcha();

  const {
    isMutating: isSigningIn,
    resendCountDown,
    allowSendEmail,
    signIn,
    signUp,
    signInWithGoogle,
  } = useAuth();

  const { trigger: verifyUser, isMutating } = useMutation({
    mutation: getUserQuery,
  });
  const [isValidEmail, setIsValidEmail] = useState(true);

  if (loginStatus === 'authenticated') {
    onSignedIn?.();
  }

  const onContinue = useAsyncCallback(async () => {
    if (!validateEmail(email)) {
      setIsValidEmail(false);
      return;
    }

    setIsValidEmail(true);
    // 0 for no access for internal beta
    let user: GetUserQuery['user'] | null | 0 = null;
    await verifyUser({ email })
      .then(({ user: u }) => {
        user = u;
      })
      .catch(err => {
        const e = err?.[0];
        if (e instanceof GraphQLError && e.extensions?.code === 402) {
          setAuthState('noAccess');
          user = 0;
        } else {
          throw err;
        }
      });

    if (user === 0) {
      return;
    }
    setAuthEmail(email);

    if (verifyToken) {
      if (user) {
        const res = await signIn(email, verifyToken, challenge);
        if (res?.status === 403 && res?.url === INTERNAL_BETA_URL) {
          return setAuthState('noAccess');
        }
        setAuthState('afterSignInSendEmail');
      } else {
        const res = await signUp(email, verifyToken, challenge);
        if (res?.status === 403 && res?.url === INTERNAL_BETA_URL) {
          return setAuthState('noAccess');
        } else if (!res || res.status >= 400 || res.error) {
          return;
        }
        setAuthState('afterSignUpSendEmail');
      }
    }
  }, [
    challenge,
    email,
    setAuthEmail,
    setAuthState,
    signIn,
    signUp,
    verifyToken,
    verifyUser,
  ]);

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['com.affine.brand.affineCloud']()}
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
          signInWithGoogle();
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

        {verifyToken ? null : <Captcha />}

        {verifyToken ? (
          <Button
            size="extraLarge"
            data-testid="continue-login-button"
            block
            loading={isMutating || isSigningIn}
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
        ) : null}

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
