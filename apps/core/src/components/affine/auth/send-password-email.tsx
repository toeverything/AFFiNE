import { Button, Wrapper } from '@affine/component';
import {
  AuthContent,
  AuthInput,
  BackButton,
  ModalHeader,
} from '@affine/component/auth-components';
import { isDesktop } from '@affine/env/constant';
import { sendChangePasswordEmailMutation } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { type FC, useCallback } from 'react';

import type { AuthPanelProps } from './index';

export const SendPasswordEmail: FC<AuthPanelProps> = ({
  setAuthState,
  setAuthStore,
  authStore: { currentEmail, hasSentPasswordEmail },
}) => {
  const t = useAFFiNEI18N();
  const { trigger: sendChangePasswordEmail } = useMutation({
    mutation: sendChangePasswordEmailMutation,
  });
  return (
    <>
      <ModalHeader
        title={t['AFFiNE Cloud']()}
        subTitle={t['com.affine.auth.reset.password']()}
      />
      <AuthContent>{t['com.affine.auth.reset.password.message']()}</AuthContent>

      <Wrapper
        marginTop={30}
        marginBottom={50}
        style={{
          position: 'relative',
        }}
      >
        <AuthInput
          label={t['com.affine.settings.email']()}
          disabled={true}
          value={currentEmail}
        />
      </Wrapper>

      <Button
        type="primary"
        size="extraLarge"
        style={{ width: '100%' }}
        disabled={hasSentPasswordEmail}
        onClick={useCallback(async () => {
          const res = await sendChangePasswordEmail({
            email: currentEmail,
            callbackUrl: `/auth/changePassword?isClient=${
              isDesktop ? 'true' : 'false'
            }`,
          });

          if (res?.sendChangePasswordEmail) {
          }
          console.log('res1', res);

          // setAuthStore({ hasSentPasswordEmail: true });
        }, [currentEmail, sendChangePasswordEmail, setAuthStore])}
      >
        {hasSentPasswordEmail
          ? t['com.affine.auth.sent']()
          : t['com.affine.auth.send.reset.link']()}
      </Button>
      <BackButton
        onClick={useCallback(() => {
          setAuthState('signIn');
        }, [setAuthState])}
      />
    </>
  );
};
