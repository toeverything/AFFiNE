import {
  ChangeEmailPage,
  ChangePasswordPage,
  SetPasswordPage,
  SignInSuccessPage,
  SignUpPage,
} from '@affine/component/auth-components';
import { changeEmailMutation, changePasswordMutation } from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import type { ReactElement } from 'react';
import { useCallback } from 'react';
import { type LoaderFunction, redirect, useParams } from 'react-router-dom';
import { z } from 'zod';

import { useCurrentLoginStatus } from '../hooks/affine/use-current-login-status';
import { useCurrentUser } from '../hooks/affine/use-current-user';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

const authTypeSchema = z.enum([
  'setPassword',
  'signIn',
  'changePassword',
  'signUp',
  'changeEmail',
]);

export const AuthPage = (): ReactElement | null => {
  const user = useCurrentUser();
  const { authType } = useParams();
  const { trigger: changePassword } = useMutation({
    mutation: changePasswordMutation,
  });

  const { trigger: changeEmail } = useMutation({
    mutation: changeEmailMutation,
  });
  const { jumpToIndex } = useNavigateHelper();

  const onChangeEmail = useCallback(
    async (email: string) => {
      const res = await changeEmail({
        id: user.id,
        newEmail: email,
      });
      return !!res?.changeEmail;
    },
    [changeEmail, user.id]
  );

  const onSetPassword = useCallback(
    (password: string) => {
      changePassword({
        id: user.id,
        newPassword: password,
      }).catch(console.error);
    },
    [changePassword, user.id]
  );
  const onOpenAffine = useCallback(() => {
    jumpToIndex(RouteLogic.REPLACE);
  }, [jumpToIndex]);

  switch (authType) {
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
          user={user}
          onChangeEmail={onChangeEmail}
          onOpenAffine={onOpenAffine}
        />
      );
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
