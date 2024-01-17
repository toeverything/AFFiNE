import {
  AuthContent,
  BackButton,
  CountDownRender,
  ModalHeader,
} from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
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
        <Trans
          i18nKey="com.affine.auth.sign.sent.email.message.sent-tips"
          values={{ email }}
          components={{ a: <a href={`mailto:${email}`} /> }}
        />
        {t['com.affine.auth.sign.sent.email.message.sent-tips.sign-in']()}
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
          <div className={style.sentRow}>
            <div className={style.sentMessage}>
              {t['com.affine.auth.sent']()}
            </div>
            <CountDownRender
              className={style.resendCountdown}
              timeLeft={resendCountDown}
            />
          </div>
        )}
      </div>

      <div className={style.authMessage} style={{ marginTop: 20 }}>
        {t['com.affine.auth.sign.auth.code.message']()}
        {subscriptionData ? null : ( // If with payment, just support email sign in to avoid duplicate redirect to the same stripe url.
          <React.Fragment>
            &nbsp;
            <Trans
              i18nKey="com.affine.auth.sign.auth.code.message.password"
              components={{
                1: (
                  <span
                    className="link"
                    data-testid="sign-in-with-password"
                    onClick={onSignInWithPasswordClick}
                  />
                ),
              }}
            />
          </React.Fragment>
        )}
      </div>

      <BackButton onClick={onBackBottomClick} />
    </>
  );
};
