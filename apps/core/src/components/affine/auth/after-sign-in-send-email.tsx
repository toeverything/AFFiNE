import {
  AuthContent,
  BackButton,
  CountDownRender,
  ModalHeader,
} from '@affine/component/auth-components';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useCallback } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import type { AuthPanelProps } from './index';
import * as style from './style.css';
import { useAuth } from './use-auth';

export const AfterSignInSendEmail = ({
  setAuthState,
  email,
  onSignedIn,
}: AuthPanelProps) => {
  const t = useAFFiNEI18N();
  const loginStatus = useCurrentLoginStatus();

  const { resendCountDown, allowSendEmail, signIn } = useAuth();
  if (loginStatus === 'authenticated') {
    onSignedIn?.();
  }

  const onResendClick = useCallback(async () => {
    await signIn(email);
  }, [email, signIn]);

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['com.affine.auth.sign.in.sent.email.subtitle']()}
      />
      <AuthContent style={{ height: 162 }}>
        {t['com.affine.auth.sign.sent.email.message.start']()}
        <a href={`mailto:${email}`}>{email}</a>
        {t['com.affine.auth.sign.sent.email.message.end']()}
      </AuthContent>

      <div className={style.resendWrapper}>
        {allowSendEmail ? (
          <Button type="plain" size="large" onClick={onResendClick}>
            {t['com.affine.auth.sign.auth.code.resend.hint']()}
          </Button>
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
        {/*prettier-ignore*/}
        <Trans i18nKey="com.affine.auth.sign.auth.code.message.password">
          If you haven&apos;t received the email, please check your spam folder.
          Or <span
            className="link"
            data-testid='sign-in-with-password'
            onClick={useCallback(() => {
              setAuthState('signInWithPassword');
            }, [setAuthState])}
          >
            sign in with password
          </span> instead.
        </Trans>
      </div>

      <BackButton
        onClick={useCallback(() => {
          setAuthState('signIn');
        }, [setAuthState])}
      />
    </>
  );
};
