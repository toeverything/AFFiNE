import {
  AuthContent,
  BackButton,
  ModalHeader,
  ResendButton,
} from '@affine/component/auth-components';
import { isDesktop } from '@affine/env/constant';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { signIn } from 'next-auth/react';
import { type FC, useCallback } from 'react';

import type { AuthPanelProps } from './index';
import * as style from './style.css';

export const AfterSignUpSendEmail: FC<AuthPanelProps> = ({
  setAuthState,
  authStore: { currentEmail },
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
        <a href={`mailto:${currentEmail}`}>{currentEmail}</a>
        {t['com.affine.auth.sign.sent.email.message.end']()}
      </AuthContent>

      <ResendButton
        onClick={() => {
          signIn('email', {
            email: currentEmail,
            callbackUrl: `/auth/signUp?isClient=${
              isDesktop ? 'true' : 'false'
            }`,
            redirect: true,
          }).catch(console.error);
        }}
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
