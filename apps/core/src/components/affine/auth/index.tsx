import {
  AuthModal as AuthModalBase,
  type AuthModalProps as AuthModalBaseProps,
} from '@affine/component/auth-components';
import { refreshRootMetadataAtom } from '@affine/workspace/atom';
import { useSetAtom } from 'jotai';
import { type FC, startTransition, useCallback, useMemo } from 'react';

import { AfterSignInSendEmail } from './after-sign-in-send-email';
import { AfterSignUpSendEmail } from './after-sign-up-send-email';
import { NoAccess } from './no-access';
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
    | 'sendEmail'
    | 'noAccess';
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
};

const config: {
  [k in AuthProps['state']]: FC<AuthPanelProps>;
} = {
  signIn: SignIn,
  afterSignUpSendEmail: AfterSignUpSendEmail,
  afterSignInSendEmail: AfterSignInSendEmail,
  signInWithPassword: SignInWithPassword,
  sendEmail: SendEmail,
  noAccess: NoAccess,
};

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
  const refreshMetadata = useSetAtom(refreshRootMetadataAtom);

  const onSignedIn = useCallback(() => {
    setOpen(false);
    startTransition(() => {
      refreshMetadata();
    });
  }, [refreshMetadata, setOpen]);

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
  const CurrentPanel = useMemo(() => {
    return config[state];
  }, [state]);

  return (
    <CurrentPanel
      email={email}
      setAuthState={setAuthState}
      setAuthEmail={setAuthEmail}
      setEmailType={setEmailType}
      emailType={emailType}
      onSignedIn={onSignedIn}
    />
  );
};
