import {
  AuthModal as AuthModalBase,
  type AuthModalProps as AuthModalBaseProps,
} from '@affine/component/auth-components';
import { atom, useAtom } from 'jotai';
import { type FC, useCallback, useEffect, useMemo } from 'react';

import { AfterSignInSendEmail } from './after-sign-in-send-email';
import { AfterSignUpSendEmail } from './after-sign-up-send-email';
import { SendPasswordEmail } from './send-password-email';
import { SignIn } from './sign-in';
import { SignInWithPassword } from './sign-in-with-password';

export type AuthModalProps = AuthModalBaseProps & {
  state:
    | 'signIn'
    | 'afterSignUpSendEmail'
    | 'afterSignInSendEmail'
    // throw away
    | 'signInWithPassword'
    | 'sendPasswordEmail';
  setAuthState: (state: AuthModalProps['state']) => void;
};

export type AuthPanelProps = {
  setAuthState: AuthModalProps['setAuthState'];
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
  sendPasswordEmail: SendPasswordEmail,
};

type AuthStoreAtom = {
  currentEmail: string;
  hasSentPasswordEmail: boolean;
  resendCountDown: number;
};
export const authStoreAtom = atom<AuthStoreAtom>({
  currentEmail: '',
  hasSentPasswordEmail: false,
  resendCountDown: 60,
});

export const AuthModal: FC<AuthModalProps> = ({
  open,
  state,
  setOpen,
  setAuthState,
}) => {
  const [authStore, setAuthStore] = useAtom(authStoreAtom);

  const CurrentPanel = useMemo(() => {
    return config[state];
  }, [state]);
  useEffect(() => {
    if (!open) {
    }
  }, [open]);

  return (
    <AuthModalBase open={open} setOpen={setOpen}>
      <CurrentPanel
        setAuthState={setAuthState}
        setOpen={setOpen}
        authStore={authStore}
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
