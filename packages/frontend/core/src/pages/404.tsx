import {
  NoPermissionOrNotFound,
  NotFoundPage,
} from '@affine/component/not-found-page';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useLiveData, useService } from '@toeverything/infra';
import type { ReactElement } from 'react';
import { useCallback, useState } from 'react';

import { SignOutModal } from '../components/affine/sign-out-modal';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';
import { AppTabsHeader } from '../modules/app-tabs-header';
import { AuthService } from '../modules/cloud';
import { SignIn } from './sign-in';

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

  return (
    <>
      {environment.isDesktop ? (
        <AppTabsHeader
          style={{
            paddingLeft: environment.isMacOs ? 80 : 0,
          }}
          reportBoundingUpdate
        />
      ) : null}
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

export const Component = PageNotFound;
