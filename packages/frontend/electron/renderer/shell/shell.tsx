import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { AppTabsHeader } from '@affine/core/modules/app-tabs-header';
import { events } from '@affine/electron-api';
import { useEffect, useState } from 'react';

import * as styles from './shell.css';

const useIsShellActive = () => {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const unsub = events?.ui.onTabShellViewActiveChange(active => {
      setActive(active);
    });
    return () => {
      unsub?.();
    };
  });

  return active;
};

export function ShellRoot() {
  const active = useIsShellActive();
  const { appSettings } = useAppSettingHelper();
  const translucent =
    environment.isDesktop &&
    environment.isMacOs &&
    appSettings.enableBlurBackground;
  return (
    <div
      className={styles.root}
      data-translucent={translucent}
      data-active={active}
    >
      <AppTabsHeader mode="shell" />
    </div>
  );
}
