import { notify } from '@affine/component';
import {
  AuthContent,
  BackButton,
  CountDownRender,
  ModalHeader,
} from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { AuthService } from '@affine/core/modules/cloud';
import { Trans, useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import type { AuthPanelProps } from './index';
import * as style from './style.css';
import { Captcha, useCaptcha } from './use-captcha';

export const AfterSignInSendEmail = ({
  setAuthData: setAuth,
  email,
  redirectUrl,
}: AuthPanelProps<'afterSignInSendEmail'>) => {
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

  const [verifyToken, challenge] = useCaptcha();

  const onResendClick = useAsyncCallback(async () => {
    setIsSending(true);
    try {
      if (verifyToken) {
        setResendCountDown(60);
        await authService.sendEmailMagicLink(
          email,
          verifyToken,
          challenge,
          redirectUrl
        );
      }
    } catch (err) {
      console.error(err);
      notify.error({
        title: 'Failed to send email, please try again.',
      });
    }
    setIsSending(false);
  }, [authService, challenge, email, redirectUrl, verifyToken]);

  const onSignInWithPasswordClick = useCallback(() => {
    setAuth({ state: 'signInWithPassword' });
  }, [setAuth]);

  const onBackBottomClick = useCallback(() => {
    setAuth({ state: 'signIn' });
  }, [setAuth]);

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
      </div>

      <BackButton onClick={onBackBottomClick} />
    </>
  );
};
