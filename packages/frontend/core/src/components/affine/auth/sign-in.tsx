import { notify } from '@affine/component';
import { AuthInput, ModalHeader } from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { authAtom } from '@affine/core/atoms';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { Trans, useI18n } from '@affine/i18n';
import { ArrowDownBigIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useAtomValue } from 'jotai';
import type { FC } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AuthService } from '../../../modules/cloud';
import { mixpanel } from '../../../utils';
import { emailRegex } from '../../../utils/email-regex';
import type { AuthPanelProps } from './index';
import { OAuth } from './oauth';
import * as style from './style.css';
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
  const t = useI18n();
  const authService = useService(AuthService);
  const [searchParams] = useSearchParams();
  const [isMutating, setIsMutating] = useState(false);
  const [verifyToken, challenge] = useCaptcha();

  const [isValidEmail, setIsValidEmail] = useState(true);
  const { openModal } = useAtomValue(authAtom);

  useEffect(() => {
    const timeout = setInterval(() => {
      // revalidate session to get the latest status
      authService.session.revalidate();
    }, 3000);
    return () => {
      clearInterval(timeout);
    };
  }, [authService]);
  const loginStatus = useLiveData(authService.session.status$);
  if (loginStatus === 'authenticated' && openModal) {
    onSignedIn?.();
  }

  const onContinue = useAsyncCallback(async () => {
    if (!validateEmail(email)) {
      setIsValidEmail(false);
      return;
    }

    setIsValidEmail(true);

    setIsMutating(true);

    setAuthEmail(email);
    try {
      const { hasPassword, isExist: isUserExist } =
        await authService.checkUserByEmail(email);

      if (verifyToken) {
        if (isUserExist) {
          // provider password sign-in if user has by default
          //  If with payment, onl support email sign in to avoid redirect to affine app
          if (hasPassword) {
            setAuthState('signInWithPassword');
          } else {
            mixpanel.track_forms('SignIn', 'Email', {
              email,
            });
            await authService.sendEmailMagicLink(
              email,
              verifyToken,
              challenge,
              searchParams.get('redirect_uri')
            );
            setAuthState('afterSignInSendEmail');
          }
        } else {
          await authService.sendEmailMagicLink(
            email,
            verifyToken,
            challenge,
            searchParams.get('redirect_uri')
          );
          mixpanel.track_forms('SignUp', 'Email', {
            email,
          });
          setAuthState('afterSignUpSendEmail');
        }
      }
    } catch (err) {
      console.error(err);

      // TODO(@eyhn): better error handling
      notify.error({
        title: 'Failed to send email. Please try again.',
      });
    }

    setIsMutating(false);
  }, [
    authService,
    challenge,
    email,
    searchParams,
    setAuthEmail,
    setAuthState,
    verifyToken,
  ]);

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['com.affine.brand.affineCloud']()}
      />

      <OAuth redirectUri={searchParams.get('redirect_uri')} />

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
            loading={isMutating}
            icon={
              <ArrowDownBigIcon
                width={20}
                height={20}
                style={{
                  transform: 'rotate(-90deg)',
                  color: 'var(--affine-blue)',
                }}
              />
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
