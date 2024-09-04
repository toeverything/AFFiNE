import { AuthPanel } from '@affine/core/components/affine/auth';

import { MobileSignInLayout } from './layout';

export const MobileSignIn = ({ onSkip }: { onSkip: () => void }) => {
  return (
    <MobileSignInLayout onSkip={onSkip}>
      <AuthPanel />
    </MobileSignInLayout>
  );
};
