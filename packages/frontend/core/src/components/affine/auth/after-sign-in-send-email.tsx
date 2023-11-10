import {
  AuthContent,
  BackButton,
  CountDownRender,
  ModalHeader,
} from '@affine/component/auth-components';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import React, { useCallback } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import type { AuthPanelProps } from './index';
import * as style from './style.css';
import { useAuth } from './use-auth';
import { Captcha, useCaptcha } from './use-captcha';
import { useSubscriptionSearch } from './use-subscription';

export const AfterSignInSendEmail = ({
  setAuthState,
  email,
  onSignedIn,
}: AuthPanelProps) => {
  const t = useAFFiNEI18N();
  const loginStatus = useCurrentLoginStatus();
  const [verifyToken, challenge] = useCaptcha();
  const subscriptionData = useSubscriptionSearch();

  const { resendCountDown, allowSendEmail, signIn } = useAuth();
  if (loginStatus === 'authenticated') {
    onSignedIn?.();
  }

  const onResendClick = useAsyncCallback(async () => {
    if (verifyToken) {
      await signIn(email, verifyToken, challenge);
    }
  }, [challenge, email, signIn, verifyToken]);

  const onSignInWithPasswordClick = useCallback(() => {
    setAuthState('signInWithPassword');
  }, [setAuthState]);

  const onBackBottomClick = useCallback(() => {
    setAuthState('signIn');
  }, [setAuthState]);

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['com.affine.auth.sign.in.sent.email.subtitle']()}
      />
      <AuthContent style={{ height: 100 }}>
        {t['com.affine.auth.sign.sent.email.message.start']()}
        <a href={`mailto:${email}`}>{email}</a>
        {t['com.affine.auth.sign.sent.email.message.end']()}
      </AuthContent>

      <div className={style.resendWrapper}>
        {allowSendEmail ? (
          <>
            <Captcha />
            <Button
              style={!verifyToken ? { cursor: 'not-allowed' } : {}}
              disabled={!verifyToken}
              type="plain"
              size="large"
              onClick={onResendClick}
            >
              {t['com.affine.auth.sign.auth.code.resend.hint']()}
            </Button>
          </>
        ) : (
          <>
            <span className="resend-code-hint">
              {t['com.affine.auth.sign.auth.code.on.resend.hint']()}
            </span>
            <CountDownRender
              className={style.resendCountdown}
              timeLeft={resendCountDown}
            />
          </>
        )}
      </div>

      <div className={style.authMessage} style={{ marginTop: 20 }}>
        {t['com.affine.auth.sign.auth.code.message']()}
        {subscriptionData ? null : ( // If with payment, just support email sign in to avoid duplicate redirect to the same stripe url.
          <React.Fragment>
            &nbsp;
            {/*prettier-ignore*/}
            <Trans i18nKey="com.affine.auth.sign.auth.code.message.password">
              Or <span
                className="link"
                data-testid='sign-in-with-password'
                onClick={onSignInWithPasswordClick}
              >
                sign in with password
              </span> instead.
            </Trans>
          </React.Fragment>
        )}
      </div>

      <BackButton onClick={onBackBottomClick} />
    </>
  );
};
