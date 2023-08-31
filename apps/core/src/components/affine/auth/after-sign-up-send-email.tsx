import {
  AuthContent,
  BackButton,
  ModalHeader,
  ResendButton,
} from '@affine/component/auth-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { type FC, useCallback } from 'react';

import { signInCloud } from '../../../utils/cloud-utils';
import { buildCallbackUrl } from './callback-url';
import type { AuthPanelProps } from './index';
import * as style from './style.css';

export const AfterSignUpSendEmail: FC<AuthPanelProps> = ({
  setAuthState,
  email,
}) => {
  const t = useAFFiNEI18N();

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.up']()}
        subTitle={t['com.affine.auth.sign.up.sent.email.subtitle']()}
      />
      <AuthContent style={{ height: 162 }}>
        {t['com.affine.auth.sign.sent.email.message.start']()}
        <a href={`mailto:${email}`}>{email}</a>
        {t['com.affine.auth.sign.sent.email.message.end']()}
      </AuthContent>

      <ResendButton
        onClick={useCallback(() => {
          signInCloud('email', {
            email: email,
            callbackUrl: buildCallbackUrl('/auth/signUp'),
            redirect: true,
          }).catch(console.error);
        }, [email])}
      />

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
