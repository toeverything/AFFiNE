import {
  NoPermissionOrNotFound,
  NotFoundPage,
} from '@affine/component/not-found-page';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { apis } from '@affine/electron-api';
import { useLiveData, useService } from '@toeverything/infra';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useState } from 'react';

import { SignOutModal } from '../components/affine/sign-out-modal';
import {
  RouteLogic,
  useNavigateHelper,
} from '../components/hooks/use-navigate-helper';
import { AuthService } from '../modules/cloud';
import { SignIn } from './auth/sign-in';

export const PageNotFound = ({
  noPermission,
}: {
  noPermission?: boolean;
}): ReactElement => {
  const authService = useService(AuthService);
  const account = useLiveData(authService.session.account$);
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
    await authService.signOut();
  }, [authService]);

  useEffect(() => {
    apis?.ui.pingAppLayoutReady().catch(console.error);
  }, []);

  return (
    <>
      {noPermission ? (
        <NoPermissionOrNotFound
          user={account}
          onBack={handleBackButtonClick}
          onSignOut={handleOpenSignOutModal}
          signInComponent={<SignIn />}
        />
      ) : (
        <NotFoundPage
          user={account}
          onBack={handleBackButtonClick}
          onSignOut={handleOpenSignOutModal}
        />
      )}

      <SignOutModal
        open={open}
        onOpenChange={setOpen}
        onConfirm={onConfirmSignOut}
      />
    </>
  );
};

export const Component = () => {
  return <PageNotFound />;
};
