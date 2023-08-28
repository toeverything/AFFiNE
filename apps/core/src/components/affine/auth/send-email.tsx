import { Wrapper } from '@affine/component';
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
import { Button } from '@toeverything/components/button';
import { useSetAtom } from 'jotai/react';
import { useCallback, useState } from 'react';

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
};

const useSendEmail = (emailType: AuthPanelProps['emailType']) => {
  const {
    trigger: sendChangePasswordEmail,
    isMutating: isChangePasswordMutating,
  } = useMutation({
    mutation: sendChangePasswordEmailMutation,
  });
  const { trigger: sendSetPasswordEmail, isMutating: isSetPasswordMutating } =
    useMutation({
      mutation: sendSetPasswordEmailMutation,
    });
  const { trigger: sendChangeEmail, isMutating: isChangeEmailMutating } =
    useMutation({
      mutation: sendChangeEmailMutation,
    });

  return {
    loading:
      isChangePasswordMutating ||
      isSetPasswordMutating ||
      isChangeEmailMutating,
    sendEmail: useCallback(
      (email: string) => {
        let trigger: (args: {
          email: string;
          callbackUrl: string;
        }) => Promise<unknown>;
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
      [
        emailType,
        sendChangeEmail,
        sendChangePasswordEmail,
        sendSetPasswordEmail,
      ]
    ),
  };
};

export const SendEmail = ({
  setAuthState,
  email,
  emailType,
}: AuthPanelProps) => {
  const t = useAFFiNEI18N();
  const [hasSentEmail, setHasSentEmail] = useState(false);
  const pushNotification = useSetAtom(pushNotificationAtom);

  const title = useEmailTitle(emailType);
  const hint = useNotificationHint(emailType);
  const buttonContent = useButtonContent(emailType);
  const { loading, sendEmail } = useSendEmail(emailType);

  const onSendEmail = useCallback(async () => {
    // TODO: add error handler
    await sendEmail(email);

    pushNotification({
      title: hint,
      message: '',
      key: Date.now().toString(),
      type: 'success',
    });
    setHasSentEmail(true);
  }, [email, hint, pushNotification, sendEmail]);

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
