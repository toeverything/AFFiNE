import {
  AuthModal as AuthModalBase,
  type AuthModalProps as AuthModalBaseProps,
} from '@affine/component/auth-components';
import { atom, useAtom } from 'jotai';
import { type FC, useCallback, useEffect, useMemo } from 'react';

import { AfterSignInSendEmail } from './after-sign-in-send-email';
import { AfterSignUpSendEmail } from './after-sign-up-send-email';
import { SendEmail } from './send-email';
import { SignIn } from './sign-in';
import { SignInWithPassword } from './sign-in-with-password';

export type AuthModalProps = AuthModalBaseProps & {
  state:
    | 'signIn'
    | 'afterSignUpSendEmail'
    | 'afterSignInSendEmail'
    // throw away
    | 'signInWithPassword'
    | 'sendEmail';
  setAuthState: (state: AuthModalProps['state']) => void;
  setAuthEmail: (state: AuthModalProps['email']) => void;
  setEmailType: (state: AuthModalProps['emailType']) => void;
  email: string;
  emailType: 'setPassword' | 'changePassword' | 'changeEmail';
};

export type AuthPanelProps = {
  email: string;
  setAuthState: AuthModalProps['setAuthState'];
  setAuthEmail: AuthModalProps['setAuthEmail'];
  setEmailType: AuthModalProps['setEmailType'];
  emailType: AuthModalProps['emailType'];
  setOpen: (open: boolean) => void;
  authStore: AuthStoreAtom;
  setAuthStore: (data: Partial<AuthStoreAtom>) => void;
};

const config: {
  [k in AuthModalProps['state']]: FC<AuthPanelProps>;
} = {
  signIn: SignIn,
  afterSignUpSendEmail: AfterSignUpSendEmail,
  afterSignInSendEmail: AfterSignInSendEmail,
  signInWithPassword: SignInWithPassword,
  sendEmail: SendEmail,
};

type AuthStoreAtom = {
  hasSentEmail: boolean;
  resendCountDown: number;
};
export const authStoreAtom = atom<AuthStoreAtom>({
  hasSentEmail: false,
  resendCountDown: 60,
});

export const AuthModal: FC<AuthModalProps> = ({
  open,
  state,
  setOpen,
  email,
  setAuthEmail,
  setAuthState,
  setEmailType,
  emailType,
}) => {
  const [authStore, setAuthStore] = useAtom(authStoreAtom);

  const CurrentPanel = useMemo(() => {
    return config[state];
  }, [state]);

  useEffect(() => {
    if (!open) {
      setAuthStore({
        hasSentEmail: false,
        resendCountDown: 60,
      });
      setAuthEmail('');
    }
  }, [open, setAuthEmail, setAuthStore]);

  return (
    <AuthModalBase open={open} setOpen={setOpen}>
      <CurrentPanel
        email={email}
        setAuthState={setAuthState}
        setAuthEmail={setAuthEmail}
        setEmailType={setEmailType}
        setOpen={setOpen}
        authStore={authStore}
        emailType={emailType}
        setAuthStore={useCallback(
          (data: Partial<AuthStoreAtom>) => {
            setAuthStore(prev => ({
              ...prev,
              ...data,
            }));
          },
          [setAuthStore]
        )}
      />
    </AuthModalBase>
  );
};
