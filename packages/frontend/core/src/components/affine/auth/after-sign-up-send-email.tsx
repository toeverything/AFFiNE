import {
  AuthContent,
  BackButton,
  CountDownRender,
  ModalHeader,
} from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { type FC, useCallback } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import type { AuthPanelProps } from './index';
import * as style from './style.css';
import { useAuth } from './use-auth';
import { Captcha, useCaptcha } from './use-captcha';

export const AfterSignUpSendEmail: FC<AuthPanelProps> = ({
  setAuthState,
  email,
  onSignedIn,
}) => {
  const t = useAFFiNEI18N();
  const loginStatus = useCurrentLoginStatus();
  const [verifyToken, challenge] = useCaptcha();

  const { resendCountDown, allowSendEmail, signUp } = useAuth();

  if (loginStatus === 'authenticated') {
    onSignedIn?.();
  }

  const onResendClick = useAsyncCallback(async () => {
    if (verifyToken) {
      await signUp(email, verifyToken, challenge);
    }
  }, [challenge, email, signUp, verifyToken]);

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.up']()}
        subTitle={t['com.affine.auth.sign.up.sent.email.subtitle']()}
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
      </div>

      <BackButton
        onClick={useCallback(() => {
          setAuthState('signIn');
        }, [setAuthState])}
      />
    </>
  );
};
