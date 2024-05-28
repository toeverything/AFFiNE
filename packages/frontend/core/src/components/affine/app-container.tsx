import type { ReactElement } from 'react';

import { useAppSettingHelper } from '../../hooks/affine/use-app-setting-helper';
import { AppSidebarFallback } from '../app-sidebar';
import type { WorkspaceRootProps } from '../workspace';
import {
  AppContainer as AppContainerWithoutSettings,
  MainContainer,
} from '../workspace';

export const AppContainer = (props: WorkspaceRootProps) => {
  const { appSettings } = useAppSettingHelper();

  return (
    <AppContainerWithoutSettings
      useNoisyBackground={appSettings.enableNoisyBackground}
      useBlurBackground={
        appSettings.enableBlurBackground &&
        environment.isDesktop &&
        environment.isMacOs
      }
      {...props}
    />
  );
};

export const AppFallback = (): ReactElement => {
  return (
    <AppContainer>
      <AppSidebarFallback />
      <MainContainer />
    </AppContainer>
  );
};
