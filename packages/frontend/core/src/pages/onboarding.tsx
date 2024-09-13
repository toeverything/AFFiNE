import { apis } from '@affine/electron-api';
import { assertExists } from '@blocksuite/global/utils';
import { useCallback } from 'react';
import { redirect } from 'react-router-dom';

import { Onboarding } from '../components/affine/onboarding/onboarding';
import {
  appConfigStorage,
  useAppConfigStorage,
} from '../hooks/use-app-config-storage';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

export const loader = () => {
  if (!BUILD_CONFIG.isElectron && !appConfigStorage.get('onBoarding')) {
    // onboarding is off, redirect to index
    return redirect('/');
  }

  return null;
};

export const Component = () => {
  const { jumpToIndex } = useNavigateHelper();
  const [, setOnboarding] = useAppConfigStorage('onBoarding');

  const openApp = useCallback(() => {
    if (BUILD_CONFIG.isElectron) {
      assertExists(apis);
      apis.ui.handleOpenMainApp().catch(err => {
        console.log('failed to open main app', err);
      });
    } else {
      jumpToIndex(RouteLogic.REPLACE);
      setOnboarding(false);
    }
  }, [jumpToIndex, setOnboarding]);

  return <Onboarding onOpenApp={openApp} />;
};
