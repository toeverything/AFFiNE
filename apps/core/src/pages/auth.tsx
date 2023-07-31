import {
  SetPasswordPage,
  SignInSuccessPage,
} from '@affine/component/auth-components';
import { changePasswordMutation } from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import type { FC } from 'react';
import { type LoaderFunction, redirect, useParams } from 'react-router-dom';

import {
  type CheckedUser,
  useCurrentUser,
} from '../hooks/affine/use-current-user';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

type AuthType = 'setPassword' | 'signIn';
const authTypes: AuthType[] = ['setPassword', 'signIn'];

export const AuthPage: FC<{ user: CheckedUser }> = ({ user }) => {
  const { authType } = useParams();
  const { trigger: changePassword } = useMutation({
    mutation: changePasswordMutation,
  });
  const { jumpToIndex } = useNavigateHelper();

  if (authType === 'setPassword') {
    return (
      <SetPasswordPage
        user={user}
        onSetPassword={password => {
          changePassword({
            email: user.email,
            newPassword: password,
            password: '',
          }).catch(console.error);
        }}
        onOpenAffine={() => {
          jumpToIndex(RouteLogic.REPLACE);
        }}
      />
    );
  }

  if (authType === 'signIn') {
    return (
      <SignInSuccessPage
        onOpenAffine={() => {
          jumpToIndex(RouteLogic.REPLACE);
        }}
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
