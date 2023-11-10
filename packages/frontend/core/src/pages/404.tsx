import { NotFoundPage } from '@affine/component/not-found-page';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { useSession } from 'next-auth/react';
import type { ReactElement } from 'react';
import { useCallback, useState } from 'react';

import { SignOutModal } from '../components/affine/sign-out-modal';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';
import { signOutCloud } from '../utils/cloud-utils';

export const Component = (): ReactElement => {
  const { data: session } = useSession();
  const { jumpToIndex } = useNavigateHelper();
  const [open, setOpen] = useState(false);

  const handleBackButtonClick = useCallback(
    () => jumpToIndex(RouteLogic.REPLACE),
    [jumpToIndex]
  );

  const handleOpenSignOutModal = useCallback(() => {
    setOpen(true);
  }, [setOpen]);

  const onConfirmSignOut = useAsyncCallback(async () => {
    setOpen(false);
    await signOutCloud({
      callbackUrl: '/signIn',
    });
  }, [setOpen]);
  return (
    <>
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
        onSignOut={handleOpenSignOutModal}
      />
      <SignOutModal
        open={open}
        onOpenChange={setOpen}
        onConfirm={onConfirmSignOut}
      />
    </>
  );
};
