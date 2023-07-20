import {
  AuthInput,
  ContinueButton,
  GoogleButton,
  ModalHeader,
} from '@affine/component/auth-components';
import { getUserQuery } from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { signIn } from 'next-auth/react';
import { type FC, useState } from 'react';
import { useCallback } from 'react';

import type { AuthPanelProps } from './index';
import * as style from './style.css';

function validateEmail(email: string) {
  return new RegExp(
    /^(?:(?:[^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@(?:(?:\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|((?:[a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  ).test(email);
}

export const SignIn: FC<AuthPanelProps> = ({
  setAuthState,
  setCurrentEmail,
}) => {
  const t = useAFFiNEI18N();

  const { trigger: verifyUser } = useMutation({
    mutation: getUserQuery,
  });
  const [isValidEmail, setIsValidEmail] = useState(true);

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const onContinue = useCallback(async () => {
    if (!validateEmail(email)) {
      setIsValidEmail(false);
      return;
    }

    setIsValidEmail(true);
    setLoading(true);
    const res = await verifyUser({ email });
    setLoading(false);

    setCurrentEmail(email);
    if (res?.user) {
      setAuthState('signInWithPassword');
    } else {
      setAuthState('confirmCode');
    }
  }, [email, setAuthState, setCurrentEmail, verifyUser]);
  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['AFFiNE Cloud']()}
      />
      <GoogleButton
        onClick={useCallback(() => {
          signIn('google').catch(console.error);
        }, [])}
      />

      <div className={style.authModalContent}>
        <AuthInput
          label={t['com.affine.settings.email']()}
          placeholder={t['com.affine.auth.sign.email.placeholder']()}
          value={email}
          onChange={value => {
            setEmail(value);
          }}
          error={!isValidEmail}
          errorHint={
            isValidEmail ? '' : t['com.affine.auth.sign.email.error']()
          }
          onEnter={onContinue}
        />
        <ContinueButton onClick={onContinue} loading={loading} />
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
