import {
  AuthModal as AuthModalBase,
  type AuthModalProps as AuthModalBaseProps,
} from '@affine/component/auth-components';
import { isDesktop } from '@affine/env/constant';
import { atom, useAtom } from 'jotai';
import { type FC, useCallback, useEffect, useMemo } from 'react';

import { AfterSignInSendEmail } from './after-sign-in-send-email';
import { AfterSignUpSendEmail } from './after-sign-up-send-email';
import { SendEmail } from './send-email';
import { SignIn } from './sign-in';
import { SignInWithPassword } from './sign-in-with-password';

export type AuthProps = {
  state:
    | 'signIn'
    | 'afterSignUpSendEmail'
    | 'afterSignInSendEmail'
    // throw away
    | 'signInWithPassword'
    | 'sendEmail';
  setAuthState: (state: AuthProps['state']) => void;
  setAuthEmail: (state: AuthProps['email']) => void;
  setEmailType: (state: AuthProps['emailType']) => void;
  email: string;
  emailType: 'setPassword' | 'changePassword' | 'changeEmail';
  onSignedIn?: () => void;
};

export type AuthPanelProps = {
  email: string;
  setAuthState: AuthProps['setAuthState'];
  setAuthEmail: AuthProps['setAuthEmail'];
  setEmailType: AuthProps['setEmailType'];
  emailType: AuthProps['emailType'];
  onSignedIn?: () => void;
  authStore: AuthStoreAtom;
  setAuthStore: (data: Partial<AuthStoreAtom>) => void;
};

const config: {
  [k in AuthProps['state']]: FC<AuthPanelProps>;
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

export const AuthModal: FC<AuthModalBaseProps & AuthProps> = ({
  open,
  state,
  setOpen,
  email,
  setAuthEmail,
  setAuthState,
  setEmailType,
  emailType,
}) => {
  const [, setAuthStore] = useAtom(authStoreAtom);

  useEffect(() => {
    if (!open) {
      setAuthStore({
        hasSentEmail: false,
        resendCountDown: 60,
      });
      setAuthEmail('');
    }
  }, [open, setAuthEmail, setAuthStore]);

  useEffect(() => {
    if (isDesktop) {
      return window.events?.ui.onFinishLogin(() => {
        setOpen(false);
      });
    }
    return;
  }, [setOpen]);

  const onSignedIn = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  return (
    <AuthModalBase open={open} setOpen={setOpen}>
      <AuthPanel
        state={state}
        email={email}
        setAuthEmail={setAuthEmail}
        setAuthState={setAuthState}
        setEmailType={setEmailType}
        emailType={emailType}
        onSignedIn={onSignedIn}
      />
    </AuthModalBase>
  );
};

export const AuthPanel: FC<AuthProps> = ({
  state,
  email,
  setAuthEmail,
  setAuthState,
  setEmailType,
  emailType,
  onSignedIn,
}) => {
  const [authStore, setAuthStore] = useAtom(authStoreAtom);

  const CurrentPanel = useMemo(() => {
    return config[state];
  }, [state]);

  useEffect(() => {
    return () => {
      setAuthStore({
        hasSentEmail: false,
        resendCountDown: 60,
      });
    };
  }, [setAuthEmail, setAuthStore]);

  return (
    <CurrentPanel
      email={email}
      setAuthState={setAuthState}
      setAuthEmail={setAuthEmail}
      setEmailType={setEmailType}
      authStore={authStore}
      emailType={emailType}
      onSignedIn={onSignedIn}
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
  );
};
