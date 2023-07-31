import { Button } from '@affine/component';
import { AuthInput, ModalHeader } from '@affine/component/auth-components';
import { isDesktop } from '@affine/env/constant';
import { getUserQuery } from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { ArrowDownBigIcon, GoogleDuotoneIcon } from '@blocksuite/icons';
import { signIn } from 'next-auth/react';
import { type FC, useState } from 'react';
import { useCallback } from 'react';

import type { AuthPanelProps } from './index';
import * as style from './style.css';

function validateEmail(currentEmail: string) {
  return new RegExp(
    /^(?:(?:[^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(?:(?:\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|((?:[a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  ).test(currentEmail);
}

export const SignIn: FC<AuthPanelProps> = ({
  setAuthState,
  setAuthStore,
  authStore: { currentEmail },
}) => {
  const t = useAFFiNEI18N();

  const { trigger: verifyUser } = useMutation({
    mutation: getUserQuery,
  });
  const [isValidEmail, setIsValidEmail] = useState(true);

  const [loading, setLoading] = useState(false);

  const onContinue = useCallback(async () => {
    if (!validateEmail(currentEmail)) {
      setIsValidEmail(false);
      return;
    }

    setIsValidEmail(true);
    setLoading(true);
    const res = await verifyUser({ email: currentEmail });
    setLoading(false);

    setAuthStore({ currentEmail });
    if (res?.user) {
      signIn('email', {
        email: currentEmail,
        callbackUrl: `/auth/signIn?isClient=${isDesktop ? 'true' : 'false'}`,
        redirect: true,
      }).catch(console.error);

      setAuthState('afterSignInSendEmail');
    } else {
      signIn('email', {
        email: currentEmail,
        callbackUrl: `/auth/signUp?isClient=${isDesktop ? 'true' : 'false'}`,
        redirect: true,
      }).catch(console.error);

      setAuthState('afterSignUpSendEmail');
    }
  }, [currentEmail, setAuthState, setAuthStore, verifyUser]);
  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['AFFiNE Cloud']()}
      />

      <Button
        type="primary"
        block
        size="extraLarge"
        style={{
          marginTop: 30,
        }}
        icon={<GoogleDuotoneIcon />}
        onClick={useCallback(() => {
          signIn('google').catch(console.error);
        }, [])}
      >
        {t['Continue with Google']()}
      </Button>

      <div className={style.authModalContent}>
        <AuthInput
          label={t['com.affine.settings.email']()}
          placeholder={t['com.affine.auth.sign.email.placeholder']()}
          value={currentEmail}
          onChange={useCallback(
            (value: string) => {
              setAuthStore({ currentEmail: value });
            },
            [setAuthStore]
          )}
          error={!isValidEmail}
          errorHint={
            isValidEmail ? '' : t['com.affine.auth.sign.email.error']()
          }
          onEnter={onContinue}
        />
        {/*<ContinueButton onClick={onContinue} loading={loading} />*/}

        <Button
          size="extraLarge"
          block
          loading={loading}
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
