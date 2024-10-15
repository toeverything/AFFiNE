import { notify } from '@affine/component';
import { AuthInput, ModalHeader } from '@affine/component/auth-components';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { Trans, useI18n } from '@affine/i18n';
import { ArrowRightBigIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import type { FC } from 'react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { AuthService } from '../../../modules/cloud';
import { emailRegex } from '../../../utils/email-regex';
import type { AuthPanelProps } from './index';
import { OAuth } from './oauth';
import * as style from './style.css';
import { Captcha, useCaptcha } from './use-captcha';

function validateEmail(email: string) {
  return emailRegex.test(email);
}

export const SignIn: FC<AuthPanelProps<'signIn'>> = ({
  setAuthData: setAuthState,
  onSkip,
}) => {
  const t = useI18n();
  const authService = useService(AuthService);
  const [searchParams] = useSearchParams();
  const [isMutating, setIsMutating] = useState(false);
  const [verifyToken, challenge, refreshChallenge] = useCaptcha();
  const [email, setEmail] = useState('');

  const [isValidEmail, setIsValidEmail] = useState(true);
  const errorMsg = searchParams.get('error');

  const onContinue = useAsyncCallback(async () => {
    if (!validateEmail(email)) {
      setIsValidEmail(false);
      return;
    }

    setIsValidEmail(true);
    setIsMutating(true);

    try {
      const { hasPassword, registered } =
        await authService.checkUserByEmail(email);

      if (verifyToken) {
        if (registered) {
          // provider password sign-in if user has by default
          //  If with payment, onl support email sign in to avoid redirect to affine app
          if (hasPassword) {
            refreshChallenge?.();
            setAuthState({
              state: 'signInWithPassword',
              email,
            });
          } else {
            await authService.sendEmailMagicLink(email, verifyToken, challenge);
            setAuthState({
              state: 'afterSignInSendEmail',
              email,
            });
          }
        } else {
          await authService.sendEmailMagicLink(email, verifyToken, challenge);
          setAuthState({
            state: 'afterSignUpSendEmail',
            email,
          });
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
    refreshChallenge,
    setAuthState,
    verifyToken,
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
          onChange={setEmail}
          error={!isValidEmail}
          errorHint={
            isValidEmail ? '' : t['com.affine.auth.sign.email.error']()
          }
          onEnter={onContinue}
        />

        {verifyToken ? (
          <Button
            style={{ width: '100%' }}
            size="extraLarge"
            data-testid="continue-login-button"
            block
            loading={isMutating}
            suffix={<ArrowRightBigIcon />}
            suffixStyle={{ width: 20, height: 20, color: cssVar('blue') }}
            onClick={onContinue}
          >
            {t['com.affine.auth.sign.email.continue']()}
          </Button>
        ) : (
          <Captcha />
        )}

        {errorMsg && <div className={style.errorMessage}>{errorMsg}</div>}

        <div className={style.authMessage}>
          {/*prettier-ignore*/}
          <Trans i18nKey="com.affine.auth.sign.message">
              By clicking &quot;Continue with Google/Email&quot; above, you acknowledge that
              you agree to AFFiNE&apos;s <a href="https://affine.pro/terms" target="_blank" rel="noreferrer">Terms of Conditions</a> and <a href="https://affine.pro/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>.
          </Trans>
        </div>
      </div>

      {onSkip ? (
        <>
          <div className={style.skipDivider}>
            <div className={style.skipDividerLine} />
            <span className={style.skipDividerText}>or</span>
            <div className={style.skipDividerLine} />
          </div>
          <div className={style.skipSection}>
            <div className={style.skipText}>
              {t['com.affine.mobile.sign-in.skip.hint']()}
            </div>
            <Button
              variant="plain"
              onClick={onSkip}
              className={style.skipLink}
              suffix={<ArrowRightBigIcon className={style.skipLinkIcon} />}
            >
              {t['com.affine.mobile.sign-in.skip.link']()}
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
};
