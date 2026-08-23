import { DefaultServerService, type Server } from '@affine/core/modules/cloud';
import type { AuthSessionStatus } from '@affine/core/modules/cloud/entities/session';
import { FrameworkScope, useService } from '@toeverything/infra';
import { useState } from 'react';

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
  onAuthenticated?: (status: AuthSessionStatus) => void;
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

  return (
    <FrameworkScope scope={server.scope}>
      {step === 'signIn' ? (
        <SignInStep
          state={state}
          changeState={setState}
          onSkip={onSkip}
          onAuthenticated={onAuthenticated}
        />
      ) : step === 'signInWithEmail' ? (
        <SignInWithEmailStep
          state={state}
          changeState={setState}
          onAuthenticated={onAuthenticated}
        />
      ) : step === 'signInWithPassword' ? (
        <SignInWithPasswordStep
          state={state}
          changeState={setState}
          onAuthenticated={onAuthenticated}
        />
      ) : step === 'addSelfhosted' ? (
        <AddSelfhostedStep state={state} changeState={setState} />
      ) : null}
    </FrameworkScope>
  );
};
