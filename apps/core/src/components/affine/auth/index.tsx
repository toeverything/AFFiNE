import {
  AuthModal as AuthModalBase,
  type AuthModalProps as AuthModalBaseProps,
} from '@affine/component/auth-components';
import { type FC, useMemo, useState } from 'react';

import { ConfirmCode } from './confirm-code';
import { SetPassword } from './set-password';
import { SignIn } from './sign-in';
import { SignInWithPassword } from './sign-in-with-password';
export type AuthModalProps = AuthModalBaseProps & {
  state:
    | 'signIn'
    | 'signInWithPassword'
    | 'confirmCode'
    | 'setPassword'
    | 'resetPassword';
  setAuthState: (state: AuthModalProps['state']) => void;
};

export type AuthPanelProps = {
  setAuthState: AuthModalProps['setAuthState'];
  setCurrentEmail: (email: string) => void;
  currentEmail: string;
};

const config: {
  [k in AuthModalProps['state']]: FC<AuthPanelProps>;
} = {
  signIn: SignIn,
  signInWithPassword: SignInWithPassword,
  confirmCode: ConfirmCode,
  setPassword: SetPassword,
  resetPassword: () => <div>resetPassword</div>,
};

export const AuthModal: FC<AuthModalProps> = ({
  open,
  state,
  setOpen,
  setAuthState,
}) => {
  const [currentEmail, setCurrentEmail] = useState('');
  const CurrentPanel = useMemo(() => {
    return config[state];
  }, [state]);
  console.log('index', currentEmail);

  return (
    <AuthModalBase open={open} setOpen={setOpen}>
      <CurrentPanel
        setAuthState={setAuthState}
        currentEmail={currentEmail}
        setCurrentEmail={setCurrentEmail}
      />
    </AuthModalBase>
  );
};
