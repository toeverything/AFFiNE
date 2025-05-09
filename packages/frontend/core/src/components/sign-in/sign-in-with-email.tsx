import { notify } from '@affine/component';
import {
  AuthContainer,
  AuthContent,
  AuthFooter,
  AuthHeader,
  AuthInput,
} from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { AuthService, CaptchaService } from '@affine/core/modules/cloud';
import type { AuthSessionStatus } from '@affine/core/modules/cloud/entities/session';
import { Unreachable } from '@affine/env/constant';
import { UserFriendlyError } from '@affine/error';
import { Trans, useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { SignInState } from '.';
import { Back } from './back';
import { Captcha } from './captcha';
import * as style from './style.css';

export const SignInWithEmailStep = ({
  state,
  changeState,
  onAuthenticated,
}: {
  state: SignInState;
  changeState: Dispatch<SetStateAction<SignInState>>;
  onAuthenticated?: (status: AuthSessionStatus) => void;
}) => {
  const initialSent = useRef(false);
  const [resendCountDown, setResendCountDown] = useState(0);

  const email = state.email;

  if (!email) {
    throw new Unreachable();
  }

  useEffect(() => {
    const timer = setInterval(() => {
      setResendCountDown(c => Math.max(c - 1, 0));
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState<string | undefined>();

  const t = useI18n();
  const authService = useService(AuthService);
  const captchaService = useService(CaptchaService);

  const verifyToken = useLiveData(captchaService.verifyToken$);
  const needCaptcha = useLiveData(captchaService.needCaptcha$);
  const challenge = useLiveData(captchaService.challenge$);

  const loginStatus = useLiveData(authService.session.status$);

  useEffect(() => {
    if (loginStatus === 'authenticated') {
      notify.success({
        title: t['com.affine.auth.toast.title.signed-in'](),
        message: t['com.affine.auth.toast.message.signed-in'](),
      });
    }
    onAuthenticated?.(loginStatus);
  }, [loginStatus, onAuthenticated, t]);

  const sendEmail = useAsyncCallback(async () => {
    if (isSending || (!verifyToken && needCaptcha)) return;
    setIsSending(true);
    try {
      setResendCountDown(60);
      captchaService.revalidate();
      await authService.sendEmailMagicLink(
        email,
        verifyToken,
        challenge,
        state.redirectUrl
      );
    } catch (err) {
      console.error(err);
      const error = UserFriendlyError.fromAny(err);
      notify.error({
        title: 'Failed to sign in',
        message: t[`error.${error.name}`](error.data),
      });
    }
    setIsSending(false);
  }, [
    authService,
    captchaService,
    challenge,
    email,
    isSending,
    needCaptcha,
    state.redirectUrl,
    verifyToken,
    t,
  ]);

  useEffect(() => {
    if (!initialSent.current && (verifyToken || !needCaptcha)) {
      initialSent.current = true;
      sendEmail();
    }
  }, [initialSent, needCaptcha, sendEmail, verifyToken]);

  const onSignInWithPasswordClick = useCallback(() => {
    changeState(prev => ({ ...prev, step: 'signInWithPassword' }));
  }, [changeState]);

  const onOtpChanged = useCallback((value: string) => {
    setOtp(value);
    setOtpError(undefined);
  }, []);

  const onContinue = useAsyncCallback(async () => {
    if (isVerifying) return;

    if (otp.length !== 6 || !/[0-9]{6}/.test(otp)) {
      setOtpError(t['com.affine.auth.sign.auth.code.invalid']());
      return;
    }

    setIsVerifying(true);

    try {
      await authService.signInMagicLink(email, otp, false);
    } catch (e) {
      notify.error({
        title: (e as UserFriendlyError).message,
      });
      setOtpError(t['com.affine.auth.sign.auth.code.invalid']());
    } finally {
      setIsVerifying(false);
    }
  }, [authService, email, isVerifying, otp, t]);

  return !verifyToken && needCaptcha ? (
    <>
      <AuthHeader title={t['com.affine.auth.sign.in']()} />
      <AuthContent style={{ height: 100 }}>
        <Captcha />
      </AuthContent>
      <Back changeState={changeState} />
    </>
  ) : (
    <AuthContainer>
      <AuthHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['com.affine.auth.sign.in.sent.email.subtitle']()}
      />
      <AuthContent>
        <p>
          <Trans
            i18nKey="com.affine.auth.sign.auth.code.hint"
            values={{ email }}
            components={{ a: <a href={`mailto:${email}`} /> }}
          />
        </p>

        <AuthInput
          placeholder={t['com.affine.auth.sign.auth.code']()}
          onChange={onOtpChanged}
          error={!!otpError}
          errorHint={otpError}
          onEnter={onContinue}
          type="text"
          required={true}
          maxLength={6}
        />

        <Button
          style={{ width: '100%' }}
          data-testid="continue-code-button"
          size="extraLarge"
          block={true}
          onClick={onContinue}
          disabled={!!otpError || isVerifying}
          loading={isVerifying}
        >
          {t['com.affine.auth.sign.auth.code.continue']()}
        </Button>

        <Button
          disabled={resendCountDown > 0}
          variant="plain"
          onClick={sendEmail}
          style={{ padding: '4px' }}
        >
          {resendCountDown <= 0 ? (
            t['com.affine.auth.sign.auth.code.resend']()
          ) : (
            <Trans
              i18nKey="com.affine.auth.sign.auth.code.resend.hint"
              values={{ second: resendCountDown }}
            />
          )}
        </Button>
      </AuthContent>

      <AuthFooter>
        <div className={style.authMessage} style={{ marginTop: 20 }}>
          {t['com.affine.auth.sign.auth.code.message']()}
          &nbsp;
          {state.hasPassword && (
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
          )}
        </div>

        <Back changeState={changeState} />
      </AuthFooter>
    </AuthContainer>
  );
};
