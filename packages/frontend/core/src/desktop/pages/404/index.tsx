import {
  NoPermissionOrNotFound,
  NotFoundPage,
} from '@affine/component/not-found-page';
import { useSignOut } from '@affine/core/components/hooks/affine/use-sign-out';
import { apis } from '@affine/electron-api';
import { useLiveData, useService } from '@toeverything/infra';
import type { ReactElement } from 'react';
import { useCallback, useEffect } from 'react';

import {
  RouteLogic,
  useNavigateHelper,
} from '../../../components/hooks/use-navigate-helper';
import { AuthService } from '../../../modules/cloud';
import { SignIn } from '../auth/sign-in';

/**
 * only for web, should not be used in electron
 */
export const PageNotFound = ({
  noPermission,
}: {
  noPermission?: boolean;
}): ReactElement => {
  const authService = useService(AuthService);
  const account = useLiveData(authService.session.account$);
  const { jumpToIndex } = useNavigateHelper();
  const openSignOutModal = useSignOut();

  const handleBackButtonClick = useCallback(
    () => jumpToIndex(RouteLogic.REPLACE),
    [jumpToIndex]
  );

  useEffect(() => {
    apis?.ui.pingAppLayoutReady().catch(console.error);
  }, []);

  return noPermission ? (
    <NoPermissionOrNotFound
      user={account}
      onBack={handleBackButtonClick}
      onSignOut={openSignOutModal}
      signInComponent={<SignIn />}
    />
  ) : (
    <NotFoundPage
      user={account}
      onBack={handleBackButtonClick}
      onSignOut={openSignOutModal}
    />
  );
};

export const Component = () => {
  return <PageNotFound />;
};
