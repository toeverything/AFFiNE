import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { AppTabsHeader } from '@affine/core/modules/app-tabs-header';
import { apis, events } from '@affine/electron-api';
import { useEffect, useState } from 'react';

import * as styles from './shell.css';

const useIsShellActive = () => {
  const [active, setActive] = useState(true);

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

const useTabsBoundingRect = () => {
  const [rect, setRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({
    x: environment.isDesktop && environment.isMacOs ? 80 : 0,
    y: 0,
    width: window.innerWidth,
    height: 52,
  });

  useEffect(() => {
    let unsub: (() => void) | undefined;
    apis?.ui
      .getTabsBoundingRect()
      .then(rect => {
        if (rect) {
          setRect(rect);
        }
        unsub = events?.ui.onTabsBoundingRectChanged(rect => {
          if (rect) {
            setRect(rect);
          }
        });
      })
      .catch(err => {
        console.error(err);
      });
    return () => {
      unsub?.();
    };
  }, []);

  return rect;
};

export function ShellRoot() {
  const active = useIsShellActive();
  const { appSettings } = useAppSettingHelper();
  const rect = useTabsBoundingRect();
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
      <AppTabsHeader
        style={{
          position: 'fixed',
          top: rect.y,
          left: rect.x,
          width: rect.width,
          height: rect.height,
        }}
      />
    </div>
  );
}
