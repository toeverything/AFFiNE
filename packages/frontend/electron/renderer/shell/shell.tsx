import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { AppTabsHeader } from '@affine/core/modules/app-tabs-header';

import * as styles from './shell.css';

export function ShellRoot() {
  const { appSettings } = useAppSettingHelper();
  const translucent =
    environment.isDesktop &&
    environment.isMacOs &&
    appSettings.enableBlurBackground;
  return (
    <div className={styles.root} data-translucent={translucent}>
      <AppTabsHeader mode="shell" />
    </div>
  );
}
