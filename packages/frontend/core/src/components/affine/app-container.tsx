import {
  AppSidebarFallback,
  ShellAppSidebarFallback,
} from '@affine/core/modules/app-sidebar/views';
import clsx from 'clsx';
import type { PropsWithChildren, ReactElement } from 'react';

import { useAppSettingHelper } from '../../components/hooks/affine/use-app-setting-helper';
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
      useBlurBackground={appSettings.enableBlurBackground}
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
        BUILD_CONFIG.isElectron && styles.electronFallback
      )}
    >
      <AppSidebarFallback />
      <MainContainerFallback>{children}</MainContainerFallback>
    </AppContainer>
  );
};

export const ShellAppFallback = ({
  className,
  children,
}: PropsWithChildren<{
  className?: string;
}>): ReactElement => {
  return (
    <AppContainer className={className}>
      <ShellAppSidebarFallback />
      <MainContainerFallback>{children}</MainContainerFallback>
    </AppContainer>
  );
};
