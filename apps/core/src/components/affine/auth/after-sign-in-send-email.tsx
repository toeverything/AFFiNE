import {
  AuthContent,
  BackButton,
  ModalHeader,
  ResendButton,
} from '@affine/component/auth-components';
import { isDesktop } from '@affine/env/constant';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { signIn } from 'next-auth/react';
import { type FC, useCallback } from 'react';

import type { AuthPanelProps } from './index';
import * as style from './style.css';

export const AfterSignInSendEmail: FC<AuthPanelProps> = ({
  setAuthState,
  authStore: { currentEmail },
}) => {
  const t = useAFFiNEI18N();

  return (
    <>
      <ModalHeader
        title={t['com.affine.auth.sign.in']()}
        subTitle={t['com.affine.auth.sign.in.sent.email.subtitle']()}
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
            callbackUrl: `/auth/signIn?isClient=${
              isDesktop ? 'true' : 'false'
            }`,
            redirect: true,
          }).catch(console.error);
        }}
      />

      <div className={style.authMessage} style={{ marginTop: 20 }}>
        {/*prettier-ignore*/}
        <Trans i18nKey="com.affine.auth.sign.auth.code.message.password">
          If you haven&apos;t received the email, please check your spam folder.
          Or <span
            className="link"
            onClick={useCallback(() => {
              setAuthState('signInWithPassword');
            }, [setAuthState])}
          >
            sign in with password
          </span> instead.
        </Trans>
      </div>

      <BackButton
        onClick={useCallback(() => {
          setAuthState('signIn');
        }, [setAuthState])}
      />
    </>
  );
};
