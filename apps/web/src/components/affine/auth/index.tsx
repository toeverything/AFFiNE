import {
  AuthModal as AuthModalBase,
  type AuthModalProps as AuthModalBaseProps,
} from '@affine/component/auth-components';
import { type FC, useMemo, useState } from 'react';

import { ConfirmCode } from './confirm-code';
import { SignIn } from './sign-in';

export type AuthModalProps = AuthModalBaseProps & {
  state:
    | 'signIn'
    | 'loginWithPassword'
    | 'confirmCode'
    | 'forgotPassword'
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
  loginWithPassword: () => <div>loginWithPassword</div>,
  confirmCode: ConfirmCode,
  forgotPassword: () => <div>forgotPassword</div>,
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
