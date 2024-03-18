import { useAppSettingHelper } from '../../hooks/affine/use-app-setting-helper';
import {
  AppContainer as AppContainerWithoutSettings,
  type WorkspaceRootProps,
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
