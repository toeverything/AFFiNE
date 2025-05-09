import { useLiveData, useService } from '@toeverything/infra';
import { Fragment, useCallback, useEffect } from 'react';

import { OpenInAppService } from '../services';
import { OpenInAppPage } from './open-in-app-page';

/**
 * Web only guard to open the URL in desktop app for different conditions
 */
const WebOpenInAppGuard = ({ children }: { children: React.ReactNode }) => {
  if (BUILD_CONFIG.isWeb === undefined || BUILD_CONFIG.isWeb === null) {
    throw new Error('WebOpenInAppGuard should only be used in web');
  }
  const service = useService(OpenInAppService);
  const shouldOpenInApp = useLiveData(service.showOpenInAppPage$);

  useEffect(() => {
    service?.bootstrap();
  }, [service]);

  const onOpenHere = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      service.hideOpenInAppPage();
    },
    [service]
  );

  if (shouldOpenInApp === undefined) {
    return null;
  }

  return shouldOpenInApp && !environment.isMobile ? (
    <OpenInAppPage openHereClicked={onOpenHere} mode="open-doc" />
  ) : (
    children
  );
};

export const OpenInAppGuard = environment.isMobile
  ? Fragment
  : WebOpenInAppGuard;
