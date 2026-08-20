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
import {
  AuthService,
  CaptchaService,
  getSelfHostedServerName,
  ServerService,
} from '@affine/core/modules/cloud';
import type { AuthSessionStatus } from '@affine/core/modules/cloud/entities/session';
import { Unreachable } from '@affine/env/constant';
import { UserFriendlyError } from '@affine/error';
import { ServerDeploymentType } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SignInState } from '.';
import { Back } from './back';
import { Captcha } from './captcha';
import * as styles from './style.css';

const MIN_SIGN_IN_LOADING_MS = 350;
const RATE_LIMIT_SIGN_IN_COOLDOWN_SECONDS = 60;

export const SignInWithPasswordStep = ({
  state,
  changeState,
  onAuthenticated,
}: {
  state: SignInState;
  changeState: Dispatch<SetStateAction<SignInState>>;
  onAuthenticated?: (status: AuthSessionStatus) => void;
}) => {
  const t = useI18n();
  const authService = useService(AuthService);

  const email = state.email;

  if (!email) {
    throw new Unreachable();
  }

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [passwordErrorHint, setPasswordErrorHint] = useState('');
  const captchaService = useService(CaptchaService);
  const serverService = useService(ServerService);
  const isSelfhosted = useLiveData(
    serverService.server.config$.selector(
      c => c.type === ServerDeploymentType.Selfhosted
    )
  );
  const serverName = useLiveData(
    serverService.server.config$.selector(c => c.serverName)
  );
  const signInServerName = isSelfhosted
    ? getSelfHostedServerName(serverName)
    : serverName;

  const verifyToken = useLiveData(captchaService.verifyToken$);
  const needCaptcha = useLiveData(captchaService.needCaptcha$);
  const challenge = useLiveData(captchaService.challenge$);
  const [isLoading, setIsLoading] = useState(false);
  const isSigningInRef = useRef(false);
  const [authErrorMessage, setAuthErrorMessage] = useState('');
  const [rateLimitCooldown, setRateLimitCooldown] = useState(0);

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

  useEffect(() => {
    setPasswordErrorHint(t['com.affine.auth.password.error']());
  }, [t]);

  useEffect(() => {
    if (rateLimitCooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setRateLimitCooldown(current => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [rateLimitCooldown]);

  const onSignIn = useAsyncCallback(
    async (currentPassword?: string) => {
      if (
        isSigningInRef.current ||
        rateLimitCooldown > 0 ||
        (!verifyToken && needCaptcha)
      ) {
        return;
      }

      isSigningInRef.current = true;
      const signInStartedAt = Date.now();
      const submittedPassword = currentPassword ?? password;
      setPasswordError(false);
      setPasswordErrorHint(t['com.affine.auth.password.error']());
      setAuthErrorMessage('');
      setRateLimitCooldown(0);
      setIsLoading(true);

      try {
        await authService.signInPassword({
          email,
          password: submittedPassword,
          verifyToken,
          challenge,
        });
      } catch (err) {
        console.error(err);
        const error = UserFriendlyError.fromAny(err);
        const isRateLimited =
          error.is('TOO_MANY_REQUEST') || error.isStatus(429);
        const translatedMessage = error.is('REQUEST_ABORTED')
          ? t['error.NETWORK_ERROR']()
          : isRateLimited
            ? t['error.TOO_MANY_REQUEST']()
            : t[`error.${error.name}`](error.data);
        const visibleMessage = isRateLimited
          ? `${translatedMessage} ${t['com.affine.auth.toast.message.failed']()}`
          : translatedMessage;
        const nativeNetworkMessage =
          BUILD_CONFIG.isNative &&
          isSelfhosted &&
          error.is('NETWORK_ERROR') &&
          error.message &&
          error.message !== translatedMessage
            ? error.message
            : null;
        const diagnosticMessage = error.message || visibleMessage;
        const shouldExposeNativeAuthError =
          BUILD_CONFIG.isNative &&
          isSelfhosted &&
          error.is('IOS_NATIVE_AUTH_FAILED');
        const selfhostedMessage = shouldExposeNativeAuthError
          ? t['com.affine.auth.toast.message.ios-auth']({
              message: diagnosticMessage,
            })
          : (nativeNetworkMessage ?? visibleMessage);
        const failedTitle = shouldExposeNativeAuthError
          ? t['com.affine.auth.toast.title.ios-auth']()
          : t['com.affine.auth.toast.title.failed']();

        if (isRateLimited) {
          setRateLimitCooldown(RATE_LIMIT_SIGN_IN_COOLDOWN_SECONDS);
        }

        if (isSelfhosted) {
          notify.error({
            title: failedTitle,
            message: selfhostedMessage,
          });
        }

        if (
          error.is('WRONG_SIGN_IN_CREDENTIALS') ||
          error.is('PASSWORD_REQUIRED')
        ) {
          setPasswordError(true);
          setPasswordErrorHint(
            isSelfhosted
              ? selfhostedMessage
              : t['com.affine.auth.password.error']()
          );
        } else {
          setPasswordError(false);
          setAuthErrorMessage(selfhostedMessage);
          if (!isSelfhosted) {
            notify.error({
              title: t['com.affine.auth.toast.title.failed'](),
              message: selfhostedMessage,
            });
          }
        }
        captchaService.revalidate();
      } finally {
        const elapsed = Date.now() - signInStartedAt;
        if (elapsed < MIN_SIGN_IN_LOADING_MS) {
          await new Promise(resolve =>
            window.setTimeout(resolve, MIN_SIGN_IN_LOADING_MS - elapsed)
          );
        }
        isSigningInRef.current = false;
        setIsLoading(false);
      }
    },
    [
      verifyToken,
      needCaptcha,
      rateLimitCooldown,
      password,
      authService,
      email,
      challenge,
      t,
      isSelfhosted,
      captchaService,
    ]
  );

  const sendMagicLink = useCallback(() => {
    changeState(prev => ({ ...prev, step: 'signInWithEmail' }));
  }, [changeState]);

  const isSubmitDisabled =
    isLoading || rateLimitCooldown > 0 || (!verifyToken && needCaptcha);
  const signInButtonText =
    rateLimitCooldown > 0
      ? `${t['com.affine.auth.sign.in']()} (${rateLimitCooldown}s)`
      : t['com.affine.auth.sign.in']();

  return (
    <AuthContainer>
      <AuthHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={signInServerName}
      />

      <AuthContent>
        <form
          onSubmit={event => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSignIn(String(form.get('password') ?? ''));
          }}
        >
          <AuthInput
            label={t['com.affine.settings.email']()}
            readOnly={true}
            value={email}
            type="email"
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <AuthInput
            autoFocus
            data-testid="password-input"
            label={t['com.affine.auth.password']()}
            value={password}
            type="password"
            name="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={isLoading}
            onChange={(value: string) => {
              setPassword(value);
              setAuthErrorMessage('');
              if (passwordError) {
                setPasswordError(false);
                setPasswordErrorHint(t['com.affine.auth.password.error']());
              }
            }}
            error={passwordError}
            errorHint={passwordErrorHint}
          />
          {!verifyToken && needCaptcha && <Captcha />}
          {authErrorMessage ? (
            <div className={styles.signInError} role="alert">
              {authErrorMessage}
            </div>
          ) : null}
          <Button
            data-testid="sign-in-button"
            variant="primary"
            size="extraLarge"
            style={{ width: '100%' }}
            loading={isLoading}
            disabled={isSubmitDisabled}
          >
            {signInButtonText}
          </Button>
        </form>
        {!isSelfhosted && (
          <div className={styles.passwordButtonRow}>
            <a
              data-testid="send-magic-link-button"
              className={styles.linkButton}
              onClick={sendMagicLink}
            >
              {t['com.affine.auth.sign.auth.code.send-email.sign-in']()}
            </a>
          </div>
        )}
      </AuthContent>
      <AuthFooter>
        <Back changeState={changeState} />
      </AuthFooter>
    </AuthContainer>
  );
};
