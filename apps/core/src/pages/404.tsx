import { NotFoundPage } from '@affine/component/not-found-page';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useSession } from 'next-auth/react';
import type { ReactElement } from 'react';
import { useCallback } from 'react';

import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';
import { signOutCloud } from '../utils/cloud-utils';

export const Component = (): ReactElement => {
  const { data: session } = useSession();
  const { jumpToIndex } = useNavigateHelper();
  const handleBackButtonClick = useCallback(
    () => jumpToIndex(RouteLogic.REPLACE),
    [jumpToIndex]
  );
  const handleSignOut = useCallback(async () => {
    await signOutCloud({
      callbackUrl: '/signIn',
    });
  }, []);
  return (
    <NotFoundPage
      user={
        session?.user
          ? {
              name: session.user.name || '',
              email: session.user.email || '',
              avatar: session.user.image || '',
            }
          : null
      }
      onBack={handleBackButtonClick}
      onSignOut={handleSignOut}
    />
  );
};
