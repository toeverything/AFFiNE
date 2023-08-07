import {
  ChangePasswordPage,
  SetPasswordPage,
  SignInSuccessPage,
  SignUpPage,
} from '@affine/component/auth-components';
import { isDesktop } from '@affine/env/constant';
import { changePasswordMutation } from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import type { FC } from 'react';
import { useCallback } from 'react';
import { type LoaderFunction, redirect, useParams } from 'react-router-dom';

import {
  type CheckedUser,
  useCurrentUser,
} from '../hooks/affine/use-current-user';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

type AuthType =
  | 'setPassword'
  | 'signIn'
  | 'changePassword'
  | 'signUp'
  | 'changeEmail';
const authTypes: AuthType[] = ['setPassword', 'signIn', 'changePassword'];

export const AuthPage: FC<{ user: CheckedUser }> = ({ user }) => {
  const { authType } = useParams();
  const { trigger: changePassword } = useMutation({
    mutation: changePasswordMutation,
  });
  const { jumpToIndex } = useNavigateHelper();

  const onSetPassword = useCallback(
    (password: string) => {
      changePassword({
        email: user.email,
        newPassword: password,
      }).catch(console.error);
    },
    [changePassword, user.email]
  );
  const onOpenAffine = useCallback(() => {
    if (isDesktop) {
      window.apis.ui.handleFinishLogin();
    } else {
      jumpToIndex(RouteLogic.REPLACE);
    }
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
  const user = useCurrentUser();

  return <AuthPage user={user} />;
};
