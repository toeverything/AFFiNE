import {
  AppContainer as AppContainerWithoutSettings,
  type WorkspaceRootProps,
} from '@affine/component/workspace';

import { useAppSetting } from '../../atoms/settings';

export const AppContainer = (props: WorkspaceRootProps) => {
  const [appSettings] = useAppSetting();

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
