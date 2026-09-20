import { SignInPanel, type SignInStep } from '@affine/core/components/sign-in';
import type { AuthSessionStatus } from '@affine/core/modules/cloud/entities/session';
import { useCallback } from 'react';

import { MobileSignInLayout } from './layout';

export const MobileSignInPanel = ({
  onClose,
  server,
  initStep,
  showCloseButton = false,
}: {
  onClose: () => void;
  server?: string;
  initStep?: SignInStep;
  showCloseButton?: boolean;
}) => {
  const onAuthenticated = useCallback(
    (status: AuthSessionStatus) => {
      if (status === 'authenticated') {
        onClose();
      }
    },
    [onClose]
  );

  return (
    <MobileSignInLayout showCloseButton={showCloseButton} onClose={onClose}>
      <SignInPanel
        onSkip={onClose}
        onAuthenticated={onAuthenticated}
        server={server}
        initStep={initStep}
      />
    </MobileSignInLayout>
  );
};
