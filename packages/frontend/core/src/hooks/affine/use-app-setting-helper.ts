import { useAtom } from 'jotai';
import { useCallback, useMemo } from 'react';

import { type AppSetting, appSettingAtom } from '../../atoms/settings';

export function useAppSettingHelper() {
  const [appSettings, setAppSettings] = useAtom(appSettingAtom);

  const updateSettings = useCallback(
    <K extends keyof AppSetting>(key: K, value: AppSetting[K]) => {
      setAppSettings(prevSettings => ({ ...prevSettings, [key]: value }));
    },
    [setAppSettings]
  );

  return useMemo(
    () => ({
      appSettings,
      updateSettings,
    }),
    [appSettings, updateSettings]
  );
}
