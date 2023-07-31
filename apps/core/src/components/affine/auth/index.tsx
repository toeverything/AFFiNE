import {
  AuthModal as AuthModalBase,
  type AuthModalProps as AuthModalBaseProps,
} from '@affine/component/auth-components';
import { type FC, useMemo, useState } from 'react';

import { AfterSignInSendEmail } from './after-sign-in-send-email';
import { AfterSignUpSendEmail } from './after-sign-up-send-email';
import { SetPassword } from './set-password';
import { SignIn } from './sign-in';
import { SignInWithPassword } from './sign-in-with-password';
export type AuthModalProps = AuthModalBaseProps & {
  state:
    | 'signIn'
    | 'afterSignUpSendEmail'
    | 'afterSignInSendEmail'
    // throw away
    | 'signInWithPassword'
    | 'setPassword'
    | 'resetPassword';
  setAuthState: (state: AuthModalProps['state']) => void;
};

export type AuthPanelProps = {
  setAuthState: AuthModalProps['setAuthState'];
  setCurrentEmail: (email: string) => void;
  currentEmail: string;
  setOpen: (open: boolean) => void;
};

const config: {
  [k in AuthModalProps['state']]: FC<AuthPanelProps>;
} = {
  signIn: SignIn,
  afterSignUpSendEmail: AfterSignUpSendEmail,
  afterSignInSendEmail: AfterSignInSendEmail,

  signInWithPassword: SignInWithPassword,
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

  return (
    <AuthModalBase open={open} setOpen={setOpen}>
      <CurrentPanel
        setAuthState={setAuthState}
        currentEmail={currentEmail}
        setCurrentEmail={setCurrentEmail}
        setOpen={setOpen}
      />
    </AuthModalBase>
  );
};
