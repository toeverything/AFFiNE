import {
  AuthInput,
  AuthModal as AuthModalBase,
  type AuthModalProps as AuthModalBaseProps,
  ContinueButton,
  GoogleButton,
  ModalHeader,
} from '@affine/component/auth-components';
import { getUserQuery } from '@affine/graphql';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { signIn } from 'next-auth/react';
import React, { type FC, useState } from 'react';
import { useCallback } from 'react';

import * as style from './style.css';
type AuthModalProps = AuthModalBaseProps;

export const AuthModal: FC<AuthModalProps> = ({ open, setOpen }) => {
  const t = useAFFiNEI18N();

  const { trigger: verifyUser } = useMutation({
    mutation: getUserQuery,
  });

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  return (
    <AuthModalBase open={open} setOpen={setOpen}>
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
          onChange={value => {
            setEmail(value);
          }}
        />
        <ContinueButton
          onClick={useCallback(async () => {
            setLoading(true);
            const res = await verifyUser({ email });
            setLoading(false);

            if (res?.user) {
              console.log('user exist');
            } else {
              console.log('user not exist');
            }
          }, [email, verifyUser])}
          loading={loading}
        />
        <div className={style.authMessage}>
          {/*prettier-ignore*/}
          <Trans i18nKey="com.affine.auth.sign.message">
            By clicking &quot;Continue with Google/Email&quot; above, you acknowledge that
            you agree to AFFiNE&apos;s <a href="https://affine.pro/terms" target="_blank">Terms of Conditions</a> and <a href="https://affine.pro/privacy" target="_blank">Privacy Policy</a>.
          </Trans>
        </div>
      </div>
    </AuthModalBase>
  );
};
