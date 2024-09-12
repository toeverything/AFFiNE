import clsx from 'clsx';
import type { PropsWithChildren, ReactElement } from 'react';

import { useAppSettingHelper } from '../../hooks/affine/use-app-setting-helper';
import { AppSidebarFallback } from '../app-sidebar';
import type { WorkspaceRootProps } from '../workspace';
import {
  AppContainer as AppContainerWithoutSettings,
  MainContainerFallback,
} from '../workspace';
import * as styles from './app-container.css';

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
    <AppContainer
      className={clsx(
        className,
        environment.isElectron && styles.electronFallback
      )}
    >
      <AppSidebarFallback />
      <MainContainerFallback>{children}</MainContainerFallback>
    </AppContainer>
  );
};
