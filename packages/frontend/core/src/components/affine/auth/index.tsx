import { notify } from '@affine/component';
import { AuthModal as AuthModalBase } from '@affine/component/auth-components';
import { authAtom, type AuthAtomData } from '@affine/core/components/atoms';
import { AuthService } from '@affine/core/modules/cloud';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useAtom } from 'jotai/react';
import type { FC } from 'react';
import { useCallback, useEffect, useRef } from 'react';

import { AfterSignInSendEmail } from './after-sign-in-send-email';
import { AfterSignUpSendEmail } from './after-sign-up-send-email';
import { SendEmail } from './send-email';
import { SignIn } from './sign-in';
import { SignInWithPassword } from './sign-in-with-password';

type AuthAtomType<T extends AuthAtomData['state']> = Extract<
  AuthAtomData,
  { state: T }
>;

// return field in B that is not in A
type Difference<
  A extends Record<string, any>,
  B extends Record<string, any>,
> = Pick<B, Exclude<keyof B, keyof A>>;

export type AuthPanelProps<State extends AuthAtomData['state']> = {
  setAuthData: <T extends AuthAtomData['state']>(
    updates: { state: T } & Difference<AuthAtomType<State>, AuthAtomType<T>>
  ) => void;
  onSkip?: () => void;
  redirectUrl?: string;
} & Extract<AuthAtomData, { state: State }>;

const config: {
  [k in AuthAtomData['state']]: FC<AuthPanelProps<k>>;
} = {
  signIn: SignIn,
  afterSignUpSendEmail: AfterSignUpSendEmail,
  afterSignInSendEmail: AfterSignInSendEmail,
  signInWithPassword: SignInWithPassword,
  sendEmail: SendEmail,
};

export function AuthModal() {
  const [authAtomValue, setAuthAtom] = useAtom(authAtom);
  const setOpen = useCallback(
    (open: boolean) => {
      setAuthAtom(prev => ({ ...prev, openModal: open }));
    },
    [setAuthAtom]
  );

  return (
    <AuthModalBase open={authAtomValue.openModal} setOpen={setOpen}>
      <AuthPanel />
    </AuthModalBase>
  );
}

export function AuthPanel({
  onSkip,
  redirectUrl,
}: {
  onSkip?: () => void;
  redirectUrl?: string | null;
}) {
  const t = useI18n();
  const [authAtomValue, setAuthAtom] = useAtom(authAtom);
  const authService = useService(AuthService);
  const loginStatus = useLiveData(authService.session.status$);
  const previousLoginStatus = useRef(loginStatus);

  const setAuthData = useCallback(
    (updates: Partial<AuthAtomData>) => {
      // @ts-expect-error checked in impls
      setAuthAtom(prev => ({
        ...prev,
        ...updates,
      }));
    },
    [setAuthAtom]
  );

  useEffect(() => {
    if (
      loginStatus === 'authenticated' &&
      previousLoginStatus.current === 'unauthenticated'
    ) {
      setAuthAtom({
        openModal: false,
        state: 'signIn',
      });
      notify.success({
        title: t['com.affine.auth.toast.title.signed-in'](),
        message: t['com.affine.auth.toast.message.signed-in'](),
      });
    }
    previousLoginStatus.current = loginStatus;
  }, [loginStatus, setAuthAtom, t]);

  const CurrentPanel = config[authAtomValue.state];

  const props = {
    ...authAtomValue,
    onSkip,
    redirectUrl,
    setAuthData,
  };

  // @ts-expect-error checked in impls
  return <CurrentPanel {...props} />;
}
