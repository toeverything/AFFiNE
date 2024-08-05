import { notify } from '@affine/component';
import {
  AuthContent,
  BackButton,
  CountDownRender,
  ModalHeader,
} from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { Trans, useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { AuthService } from '../../../modules/cloud';
import type { AuthPanelProps } from './index';
import * as style from './style.css';
import { Captcha, useCaptcha } from './use-captcha';

export const AfterSignUpSendEmail: FC<AuthPanelProps> = ({
  setAuthState,
  email,
  onSignedIn,
}) => {
  const [resendCountDown, setResendCountDown] = useState(60);

  useEffect(() => {
    const timer = setInterval(() => {
      setResendCountDown(c => Math.max(c - 1, 0));
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const [isSending, setIsSending] = useState(false);
  const t = useI18n();
  const authService = useService(AuthService);
  const loginStatus = useLiveData(authService.session.status$);
  useEffect(() => {
    const timeout = setInterval(() => {
      // revalidate session to get the latest status
      authService.session.revalidate();
    }, 3000);
    return () => {
      clearInterval(timeout);
    };
  }, [authService]);
  if (loginStatus === 'authenticated') {
    onSignedIn?.();
  }

  const [verifyToken, challenge] = useCaptcha();

  const onResendClick = useAsyncCallback(async () => {
    setIsSending(true);
    try {
      if (verifyToken) {
        await authService.sendEmailMagicLink(email, verifyToken, challenge);
      }
      setResendCountDown(60);
    } catch (err) {
      console.error(err);
      notify.error({
        title: 'Failed to send email, please try again.',
      });
    }
    setIsSending(false);
  }, [authService, challenge, email, verifyToken]);

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.up']()}
        subTitle={t['com.affine.auth.sign.up.sent.email.subtitle']()}
      />
      <AuthContent style={{ height: 100 }}>
        <Trans
          i18nKey="com.affine.auth.sign.sent.email.message.sent-tips"
          values={{ email }}
          components={{ a: <a href={`mailto:${email}`} /> }}
        />
        {t['com.affine.auth.sign.sent.email.message.sent-tips.sign-up']()}
      </AuthContent>

      <div className={style.resendWrapper}>
        {resendCountDown <= 0 ? (
          <>
            <Captcha />
            <Button
              style={!verifyToken ? { cursor: 'not-allowed' } : {}}
              disabled={!verifyToken || isSending}
              variant="plain"
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
      </div>

      <BackButton
        onClick={useCallback(() => {
          setAuthState('signIn');
        }, [setAuthState])}
      />
    </>
  );
};
