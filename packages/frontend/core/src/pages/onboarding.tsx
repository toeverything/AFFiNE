import { Button } from '@affine/component/ui/button';
import { redirect } from 'react-router-dom';

import {
  appConfigStorage,
  useAppConfigStorage,
} from '../hooks/use-app-config-storage';
import { RouteLogic, useNavigateHelper } from '../hooks/use-navigate-helper';

export const loader = () => {
  if (!environment.isDesktop && !appConfigStorage.get('onBoarding')) {
    // onboarding is off, redirect to index
    return redirect('/');
  }

  return null;
};

export const Component = () => {
  const { jumpToIndex } = useNavigateHelper();
  const [onBoarding, setOnboarding] = useAppConfigStorage('onBoarding');

  const openApp = () => {
    if (environment.isDesktop) {
      window.apis.ui.handleOpenMainApp().catch(err => {
        console.log('failed to open main app', err);
      });
    } else {
      jumpToIndex(RouteLogic.REPLACE);
      setOnboarding(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        gap: '8px',
        height: '100vh',
      }}
    >
      <Button onClick={() => setOnboarding(!onBoarding)}>
        Toggle onboarding
      </Button>
      onboarding page, onboarding mode is {onBoarding ? 'on' : 'off'}
      <Button onClick={openApp}>Enter App</Button>
    </div>
  );
};
