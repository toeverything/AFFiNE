import { apis } from '@affine/electron-api';
import { useCallback } from 'react';
import { redirect } from 'react-router-dom';

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
  const openApp = useCallback(() => {
    apis?.ui.handleOpenMainApp().catch(err => {
      console.log('failed to open main app', err);
    });
  }, []);

  return <Onboarding onOpenApp={openApp} />;
};
