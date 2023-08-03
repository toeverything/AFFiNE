import {
  ChangeEmailPage,
  ChangePasswordPage,
  SetPasswordPage,
  SignInSuccessPage,
  SignUpPage,
} from '@affine/component/auth-components';
import { changeEmailMutation, changePasswordMutation } from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import { SessionProvider } from 'next-auth/react';
import { type FC, useEffect } from 'react';
import { useCallback } from 'react';
import { type LoaderFunction, redirect, useParams } from 'react-router-dom';

import { useCurrenLoginStatus } from '../hooks/affine/use-curren-login-status';
import { useCurrentUser } from '../hooks/affine/use-current-user';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

type AuthType =
  | 'setPassword'
  | 'signIn'
  | 'changePassword'
  | 'signUp'
  | 'changeEmail';
const authTypes: AuthType[] = [
  'setPassword',
  'signIn',
  'changePassword',
  'signUp',
  'changeEmail',
];

export const AuthPage: FC = () => {
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

  if (authType === 'signUp') {
    return (
      <SignUpPage
        user={user}
        onSetPassword={onSetPassword}
        onOpenAffine={onOpenAffine}
      />
    );
  }

  if (authType === 'signIn') {
    return <SignInSuccessPage onOpenAffine={onOpenAffine} />;
  }
  if (authType === 'changePassword') {
    return (
      <ChangePasswordPage
        user={user}
        onSetPassword={onSetPassword}
        onOpenAffine={onOpenAffine}
      />
    );
  }
  if (authType === 'setPassword') {
    return (
      <SetPasswordPage
        user={user}
        onSetPassword={onSetPassword}
        onOpenAffine={onOpenAffine}
      />
    );
  }
  if (authType === 'changeEmail') {
    return (
      <ChangeEmailPage
        user={user}
        onChangeEmail={onChangeEmail}
        onOpenAffine={onOpenAffine}
      />
    );
  }

  return null;
};

export const loader: LoaderFunction = async args => {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  if (!authTypes.includes(args.params.authType)) {
    return redirect('/404');
  }
  return null;
};
export const Component = () => {
  const Page = () => {
    const loginStatus = useCurrenLoginStatus();
    const { jumpToExpired } = useNavigateHelper();

    useEffect(() => {
      if (loginStatus === 'unauthenticated') {
        jumpToExpired(RouteLogic.REPLACE);
      }
    }, [jumpToExpired, loginStatus]);

    if (loginStatus === 'authenticated') {
      return <AuthPage />;
    }
    return null;
  };
  return (
    <SessionProvider>
      <Page />
    </SessionProvider>
  );
};
