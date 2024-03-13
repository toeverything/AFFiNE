import {
  AuthInput,
  CountDownRender,
  ModalHeader,
} from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import {
  findGraphQLError,
  type GetUserQuery,
  getUserQuery,
} from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowDownBigIcon } from '@blocksuite/icons';
import { type FC, useState } from 'react';
import { useCallback } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import { useMutation } from '../../../hooks/use-mutation';
import { emailRegex } from '../../../utils/email-regex';
import type { AuthPanelProps } from './index';
import { OAuth } from './oauth';
import * as style from './style.css';
import { INTERNAL_BETA_URL, useAuth } from './use-auth';
import { Captcha, useCaptcha } from './use-captcha';
import { useSubscriptionSearch } from './use-subscription';

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
  const subscriptionData = useSubscriptionSearch();

  const {
    isMutating: isSigningIn,
    resendCountDown,
    allowSendEmail,
    signIn,
    signUp,
  } = useAuth();

  const { trigger: verifyUser, isMutating } = useMutation({
    mutation: getUserQuery,
  });
  const [isValidEmail, setIsValidEmail] = useState(true);

  if (loginStatus === 'authenticated') {
    onSignedIn?.();
  }

  const onContinue = useAsyncCallback(async () => {
    if (!allowSendEmail) {
      return;
    }

    if (!validateEmail(email)) {
      setIsValidEmail(false);
      return;
    }

    setIsValidEmail(true);
    // 0 for no access for internal beta
    const user: GetUserQuery['user'] | null | 0 = await verifyUser({ email })
      .then(({ user }) => user)
      .catch(err => {
        if (findGraphQLError(err, e => e.extensions.code === 402)) {
          setAuthState('noAccess');
          return 0;
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
        // provider password sign-in if user has by default
        //  If with payment, onl support email sign in to avoid redirect to affine app
        if (user.hasPassword && !subscriptionData) {
          setAuthState('signInWithPassword');
        } else {
          const res = await signIn(email, verifyToken, challenge);
          if (res?.status === 403 && res?.url === INTERNAL_BETA_URL) {
            return setAuthState('noAccess');
          }
          setAuthState('afterSignInSendEmail');
        }
      } else {
        const res = await signUp(email, verifyToken, challenge);
        if (res?.status === 403 && res?.url === INTERNAL_BETA_URL) {
          return setAuthState('noAccess');
        } else if (!res || res.status >= 400) {
          return;
        }
        setAuthState('afterSignUpSendEmail');
      }
    }
  }, [
    allowSendEmail,
    subscriptionData,
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

      <OAuth />

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
