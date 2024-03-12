import {
  ChangeEmailPage,
  ChangePasswordPage,
  ConfirmChangeEmail,
  OnboardingPage,
  SetPasswordPage,
  SignInSuccessPage,
  SignUpPage,
} from '@affine/component/auth-components';
import { pushNotificationAtom } from '@affine/component/notification-center';
import {
  changeEmailMutation,
  changePasswordMutation,
  sendVerifyChangeEmailMutation,
  verifyEmailMutation,
} from '@affine/graphql';
import { fetcher } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useSetAtom } from 'jotai/react';
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import {
  type LoaderFunction,
  redirect,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { z } from 'zod';

import { SubscriptionRedirect } from '../components/affine/auth/subscription-redirect';
import { WindowsAppControls } from '../components/pure/header/windows-app-controls';
import { useCurrentLoginStatus } from '../hooks/affine/use-current-login-status';
import { useCurrentUser } from '../hooks/affine/use-current-user';
import { useMutation } from '../hooks/use-mutation';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

const authTypeSchema = z.enum([
  'onboarding',
  'setPassword',
  'signIn',
  'changePassword',
  'signUp',
  'changeEmail',
  'confirm-change-email',
  'subscription-redirect',
  'verify-email',
]);

export const AuthPage = (): ReactElement | null => {
  const user = useCurrentUser();
  const t = useAFFiNEI18N();

  const { authType } = useParams();
  const [searchParams] = useSearchParams();
  const pushNotification = useSetAtom(pushNotificationAtom);

  const { trigger: changePassword } = useMutation({
    mutation: changePasswordMutation,
  });

  const { trigger: sendVerifyChangeEmail } = useMutation({
    mutation: sendVerifyChangeEmailMutation,
  });

  const { jumpToIndex } = useNavigateHelper();

  const onSendVerifyChangeEmail = useCallback(
    async (email: string) => {
      const res = await sendVerifyChangeEmail({
        token: searchParams.get('token') || '',
        email,
        callbackUrl: `/auth/confirm-change-email`,
      }).catch(console.error);

      // FIXME: There is not notification
      if (res?.sendVerifyChangeEmail) {
        pushNotification({
          title: t['com.affine.auth.sent.verify.email.hint'](),
          type: 'success',
        });
      } else {
        pushNotification({
          title: t['com.affine.auth.sent.change.email.fail'](),
          type: 'error',
        });
      }

      return !!res?.sendVerifyChangeEmail;
    },
    [pushNotification, searchParams, sendVerifyChangeEmail, t]
  );

  const onSetPassword = useCallback(
    async (password: string) => {
      await changePassword({
        token: searchParams.get('token') || '',
        newPassword: password,
      });
    },
    [changePassword, searchParams]
  );
  const onOpenAffine = useCallback(() => {
    jumpToIndex(RouteLogic.REPLACE);
  }, [jumpToIndex]);

  switch (authType) {
    case 'onboarding':
      return (
        <OnboardingPage
          user={user}
          onOpenAffine={onOpenAffine}
          windowControl={<WindowsAppControls />}
        />
      );
    case 'signUp': {
      return (
        <SignUpPage
          user={user}
          onSetPassword={onSetPassword}
          onOpenAffine={onOpenAffine}
        />
      );
    }
    case 'signIn': {
      return <SignInSuccessPage onOpenAffine={onOpenAffine} />;
    }
    case 'changePassword': {
      return (
        <ChangePasswordPage
          user={user}
          onSetPassword={onSetPassword}
          onOpenAffine={onOpenAffine}
        />
      );
    }
    case 'setPassword': {
      return (
        <SetPasswordPage
          user={user}
          onSetPassword={onSetPassword}
          onOpenAffine={onOpenAffine}
        />
      );
    }
    case 'changeEmail': {
      return (
        <ChangeEmailPage
          onChangeEmail={onSendVerifyChangeEmail}
          onOpenAffine={onOpenAffine}
        />
      );
    }
    case 'confirm-change-email': {
      return <ConfirmChangeEmail onOpenAffine={onOpenAffine} />;
    }
    case 'subscription-redirect': {
      return <SubscriptionRedirect />;
    }
    case 'verify-email': {
      return <ConfirmChangeEmail onOpenAffine={onOpenAffine} />;
    }
  }
  return null;
};

export const loader: LoaderFunction = async args => {
  if (!args.params.authType) {
    return redirect('/404');
  }
  if (!authTypeSchema.safeParse(args.params.authType).success) {
    return redirect('/404');
  }

  if (args.params.authType === 'confirm-change-email') {
    const url = new URL(args.request.url);
    const searchParams = url.searchParams;
    const token = searchParams.get('token') ?? '';
    const email = decodeURIComponent(searchParams.get('email') ?? '');
    const res = await fetcher({
      query: changeEmailMutation,
      variables: {
        token: token,
        email: email,
      },
    }).catch(console.error);
    // TODO: Add error handling
    if (!res?.changeEmail) {
      return redirect('/expired');
    }
  } else if (args.params.authType === 'verify-email') {
    const url = new URL(args.request.url);
    const searchParams = url.searchParams;
    const token = searchParams.get('token') ?? '';
    const res = await fetcher({
      query: verifyEmailMutation,
      variables: {
        token: token,
      },
    }).catch(console.error);

    if (!res?.verifyEmail) {
      return redirect('/expired');
    }
  }
  return null;
};

export const Component = () => {
  const loginStatus = useCurrentLoginStatus();
  const { jumpToExpired } = useNavigateHelper();

  if (loginStatus === 'unauthenticated') {
    jumpToExpired(RouteLogic.REPLACE);
  }

  if (loginStatus === 'authenticated') {
    return <AuthPage />;
  }

  return null;
};
