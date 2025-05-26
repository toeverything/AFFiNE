import { DesktopApiService } from '@affine/core/modules/desktop-api';
import { useServiceOptional } from '@toeverything/infra';
import { useCallback } from 'react';
import { redirect } from 'react-router';

import { Onboarding } from '../../../components/affine/onboarding/onboarding';
import { appConfigStorage } from '../../../components/hooks/use-app-config-storage';

/**
 * /onboarding page
 *
 * only for electron
 */
export const loader = () => {
  if (!BUILD_CONFIG.isElectron && !appConfigStorage.get('onBoarding')) {
    // onboarding is off, redirect to index
    return redirect('/');
  }

  return null;
};

export const Component = () => {
  const desktopApi = useServiceOptional(DesktopApiService);

  const openApp = useCallback(() => {
    desktopApi?.handler.ui.handleOpenMainApp().catch(err => {
      console.log('failed to open main app', err);
    });
  }, [desktopApi]);

  return <Onboarding onOpenApp={openApp} />;
};
