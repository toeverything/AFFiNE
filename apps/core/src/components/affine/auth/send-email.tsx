import { Button, Wrapper } from '@affine/component';
import {
  AuthContent,
  AuthInput,
  BackButton,
  ModalHeader,
} from '@affine/component/auth-components';
import { pushNotificationAtom } from '@affine/component/notification-center';
import { isDesktop } from '@affine/env/constant';
import {
  sendChangeEmailMutation,
  sendChangePasswordEmailMutation,
  sendSetPasswordEmailMutation,
} from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation } from '@affine/workspace/affine/gql';
import { useSetAtom } from 'jotai/index';
import { type FC, useCallback, useState } from 'react';

import type { AuthPanelProps } from './index';

const useEmailTitle = (emailType: AuthPanelProps['emailType']) => {
  const t = useAFFiNEI18N();

  switch (emailType) {
    case 'setPassword':
      return t['com.affine.auth.set.password']();
    case 'changePassword':
      return t['com.affine.auth.reset.password']();
    case 'changeEmail':
      return t['com.affine.settings.email.action']();
  }
  return '';
};

const useNotificationHint = (emailType: AuthPanelProps['emailType']) => {
  const t = useAFFiNEI18N();

  switch (emailType) {
    case 'setPassword':
      return t['com.affine.auth.sent.set.password.hint']();
    case 'changePassword':
      return t['com.affine.auth.sent.change.password.hint']();
    case 'changeEmail':
      return t['com.affine.auth.sent.change.email.hint']();
  }
  return '';
};
const useButtonContent = (emailType: AuthPanelProps['emailType']) => {
  const t = useAFFiNEI18N();

  switch (emailType) {
    case 'setPassword':
      return t['com.affine.auth.send.set.password.link']();
    case 'changePassword':
      return t['com.affine.auth.send.reset.password.link']();
    case 'changeEmail':
      return t['com.affine.auth.send.change.email.link']();
  }
  return '';
};

const useSendEmail = (emailType: AuthPanelProps['emailType']) => {
  const { trigger: sendChangePasswordEmail } = useMutation({
    mutation: sendChangePasswordEmailMutation,
  });
  const { trigger: sendSetPasswordEmail } = useMutation({
    mutation: sendSetPasswordEmailMutation,
  });
  const { trigger: sendChangeEmail } = useMutation({
    mutation: sendChangeEmailMutation,
  });

  return useCallback(
    (email: string) => {
      let trigger;
      let callbackUrl;
      switch (emailType) {
        case 'setPassword':
          trigger = sendSetPasswordEmail;
          callbackUrl = 'setPassword';
          break;
        case 'changePassword':
          trigger = sendChangePasswordEmail;
          callbackUrl = 'changePassword';
          break;
        case 'changeEmail':
          trigger = sendChangeEmail;
          callbackUrl = 'changeEmail';
          break;
      }
      // TODO: add error handler
      return trigger({
        email,
        callbackUrl: `/auth/${callbackUrl}?isClient=${
          isDesktop ? 'true' : 'false'
        }`,
      });
    },
    [emailType, sendChangeEmail, sendChangePasswordEmail, sendSetPasswordEmail]
  );
};

export const SendEmail: FC<AuthPanelProps> = ({
  setAuthState,
  setAuthStore,
  email,
  authStore: { hasSentEmail },
  emailType,
}) => {
  const t = useAFFiNEI18N();
  const pushNotification = useSetAtom(pushNotificationAtom);

  const title = useEmailTitle(emailType);
  const hint = useNotificationHint(emailType);
  const buttonContent = useButtonContent(emailType);
  const sendEmail = useSendEmail(emailType);

  const [loading, setLoading] = useState(false);

  const onSendEmail = useCallback(async () => {
    setLoading(true);
    // TODO: add error handler
    await sendEmail(email);
    setLoading(false);

    pushNotification({
      title: hint,
      message: '',
      key: Date.now().toString(),
      type: 'success',
    });
    setAuthStore({ hasSentEmail: true });
  }, [email, hint, pushNotification, sendEmail, setAuthStore]);

  return (
    <>
      <ModalHeader title={t['AFFiNE Cloud']()} subTitle={title} />
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
        disabled={hasSentEmail}
        loading={loading}
        onClick={onSendEmail}
      >
        {hasSentEmail ? t['com.affine.auth.sent']() : buttonContent}
      </Button>
      <BackButton
        onClick={useCallback(() => {
          setAuthState('signIn');
        }, [setAuthState])}
      />
    </>
  );
};
