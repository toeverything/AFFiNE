import { DesktopApiService } from '@affine/core/modules/desktop-api';
import { useService } from '@toeverything/infra';
import { useTheme } from 'next-themes';
import { useRef } from 'react';

export const DesktopThemeSync = () => {
  const { theme } = useTheme();
  const lastThemeRef = useRef(theme);
  const onceRef = useRef(false);

  const handler = useService(DesktopApiService).api.handler;

  if (lastThemeRef.current !== theme || !onceRef.current) {
    if (BUILD_CONFIG.isElectron && theme) {
      handler.ui
        .handleThemeChange(theme as 'dark' | 'light' | 'system')
        .catch(err => {
          console.error(err);
        });
    }
    lastThemeRef.current = theme;
    onceRef.current = true;
  }
  return null;
};
