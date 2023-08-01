import { Button, Wrapper } from '@affine/component';
import {
  AuthContent,
  AuthInput,
  BackButton,
  ModalHeader,
} from '@affine/component/auth-components';
import { pushNotificationAtom } from '@affine/component/notification-center';
import { isDesktop } from '@affine/env/constant';
import { sendChangePasswordEmailMutation } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { useSetAtom } from 'jotai/index';
import { type FC, useCallback, useState } from 'react';

import type { AuthPanelProps } from './index';

export const SendPasswordEmail: FC<AuthPanelProps> = ({
  setAuthState,
  setAuthStore,
  email,
  authStore: { hasSentPasswordEmail },
}) => {
  const t = useAFFiNEI18N();
  const { trigger: sendChangePasswordEmail } = useMutation({
    mutation: sendChangePasswordEmailMutation,
  });
  const pushNotification = useSetAtom(pushNotificationAtom);
  const [loading, setLoading] = useState(false);
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
          value={email}
        />
      </Wrapper>

      <Button
        type="primary"
        size="extraLarge"
        style={{ width: '100%' }}
        disabled={hasSentPasswordEmail}
        loading={loading}
        onClick={useCallback(async () => {
          setLoading(true);
          const res = await sendChangePasswordEmail({
            email,
            callbackUrl: `/auth/changePassword?isClient=${
              isDesktop ? 'true' : 'false'
            }`,
          });
          setLoading(false);
          console.log('res', res?.sendChangePasswordEmail);

          if (!res?.sendChangePasswordEmail) {
            // TODO: add error message
            return;
          }
          console.log('222', 222);

          pushNotification({
            title: t['com.affine.auth.sent.change.password.hint'](),
            message: '',
            key: Date.now().toString(),
            type: 'success',
          });
          setAuthStore({ hasSentPasswordEmail: true });
        }, [email, pushNotification, sendChangePasswordEmail, setAuthStore, t])}
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
