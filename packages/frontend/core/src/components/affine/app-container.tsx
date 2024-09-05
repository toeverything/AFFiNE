import type { PropsWithChildren, ReactElement } from 'react';

import { useAppSettingHelper } from '../../hooks/affine/use-app-setting-helper';
import { AppSidebarFallback } from '../app-sidebar';
import type { WorkspaceRootProps } from '../workspace';
import {
  AppContainer as AppContainerWithoutSettings,
  MainContainerFallback,
} from '../workspace';

export const AppContainer = (props: WorkspaceRootProps) => {
  const { appSettings } = useAppSettingHelper();

  return (
    <AppContainerWithoutSettings
      useNoisyBackground={appSettings.enableNoisyBackground}
      useBlurBackground={
        appSettings.enableBlurBackground &&
        environment.isElectron &&
        environment.isMacOs
      }
      {...props}
    />
  );
};

export const AppFallback = ({
  className,
  children,
}: PropsWithChildren<{
  className?: string;
}>): ReactElement => {
  return (
    <AppContainer className={className}>
      <AppSidebarFallback />
      <MainContainerFallback>{children}</MainContainerFallback>
    </AppContainer>
  );
};
