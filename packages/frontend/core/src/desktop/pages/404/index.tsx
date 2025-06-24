import {
  NoPermissionOrNotFound,
  NotFoundPage,
} from '@affine/component/not-found-page';
import { useSignOut } from '@affine/core/components/hooks/affine/use-sign-out';
import { DesktopApiService } from '@affine/core/modules/desktop-api';
import {
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
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
  const desktopApi = useServiceOptional(DesktopApiService);
  const account = useLiveData(authService.session.account$);
  const { jumpToIndex } = useNavigateHelper();
  const openSignOutModal = useSignOut();

  const handleBackButtonClick = useCallback(
    () => jumpToIndex(RouteLogic.REPLACE),
    [jumpToIndex]
  );

  useEffect(() => {
    desktopApi?.handler.ui.pingAppLayoutReady(true).catch(console.error);
  }, [desktopApi]);

  // not using workbench location or router location deliberately
  // strip the origin
  const currentUrl = window.location.href.replace(window.location.origin, '');

  return noPermission ? (
    <NoPermissionOrNotFound
      user={account}
      onBack={handleBackButtonClick}
      onSignOut={openSignOutModal}
      signInComponent={<SignIn redirectUrl={currentUrl} />}
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
