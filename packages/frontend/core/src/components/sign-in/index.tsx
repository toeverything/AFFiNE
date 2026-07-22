import { DefaultServerService, type Server } from '@affine/core/modules/cloud';
import type { AuthSessionStatus } from '@affine/core/modules/cloud/entities/session';
import { FrameworkScope, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { AddSelfhostedStep } from './add-selfhosted';
import { SignInStep } from './sign-in';
import { SignInWithEmailStep } from './sign-in-with-email';
import { SignInWithPasswordStep } from './sign-in-with-password';

export type SignInStep =
  | 'signIn'
  | 'signInWithPassword'
  | 'signInWithEmail'
  | 'addSelfhosted';

export interface SignInState {
  step: SignInStep;
  server?: Server;
  initialServerBaseUrl?: string;
  email?: string;
  hasPassword?: boolean;
  redirectUrl?: string;
}

export const SignInPanel = ({
  onSkip,
  server: initialServerBaseUrl,
  initStep,
  onAuthenticated,
}: {
  onAuthenticated?: (status: AuthSessionStatus, server?: Server) => void;
  onSkip: () => void;
  server?: string;
  initStep?: SignInStep | undefined;
}) => {
  const [state, setState] = useState<SignInState>({
    step: initStep
      ? initStep
      : initialServerBaseUrl
        ? 'addSelfhosted'
        : 'signIn',
    initialServerBaseUrl: initialServerBaseUrl,
  });

  const defaultServerService = useService(DefaultServerService);

  const step = state.step;
  const server = state.server ?? defaultServerService.server;

  // Surface which server was actually signed into (the self-hosted flow picks it
  // inside AddSelfhostedStep, so the outer panel otherwise can't know it). Optional
  // second arg keeps existing callers (e.g. desktop) unchanged.
  const handleAuthenticated = useCallback(
    (status: AuthSessionStatus) => {
      onAuthenticated?.(status, server);
    },
    [onAuthenticated, server]
  );

  return (
    <FrameworkScope scope={server.scope}>
      {step === 'signIn' ? (
        <SignInStep
          state={state}
          changeState={setState}
          onSkip={onSkip}
          onAuthenticated={handleAuthenticated}
        />
      ) : step === 'signInWithEmail' ? (
        <SignInWithEmailStep
          state={state}
          changeState={setState}
          onAuthenticated={handleAuthenticated}
        />
      ) : step === 'signInWithPassword' ? (
        <SignInWithPasswordStep
          state={state}
          changeState={setState}
          onAuthenticated={handleAuthenticated}
        />
      ) : step === 'addSelfhosted' ? (
        <AddSelfhostedStep state={state} changeState={setState} />
      ) : null}
    </FrameworkScope>
  );
};
