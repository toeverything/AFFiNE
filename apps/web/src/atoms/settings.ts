import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useCallback } from 'react';

export type DateFormats =
  | 'MM/dd/YYYY'
  | 'dd/MM/YYYY'
  | 'YYYY-MM-dd'
  | 'YYYY.MM.dd'
  | 'YYYY/MM/dd'
  | 'dd-MMM-YYYY'
  | 'dd MMMM YYYY';

export type AppSetting = {
  clientBorder: boolean;
  fullWidthLayout: boolean;
  windowFrameStyle: 'frameless' | 'NativeTitleBar';
  dateFormat: DateFormats;
  startWeekOnMonday: boolean;
  enableBlurBackground: boolean;
  enableNoisyBackground: boolean;
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
};
export const windowFrameStyleOptions: AppSetting['windowFrameStyle'][] = [
  'frameless',
  'NativeTitleBar',
];

export const dateFormatOptions: DateFormats[] = [
  'MM/dd/YYYY',
  'dd/MM/YYYY',
  'YYYY-MM-dd',
  'YYYY.MM.dd',
  'YYYY/MM/dd',
  'dd-MMM-YYYY',
  'dd MMMM YYYY',
];

export const AppSettingAtom = atomWithStorage<AppSetting>('AFFiNE settings', {
  clientBorder: false,
  fullWidthLayout: false,
  windowFrameStyle: 'frameless',
  dateFormat: dateFormatOptions[0],
  startWeekOnMonday: false,
  enableBlurBackground: true,
  enableNoisyBackground: true,
  autoCheckUpdate: true,
  autoDownloadUpdate: true,
});

export const useAppSetting = () => {
  const [settings, setSettings] = useAtom(AppSettingAtom);

  return [
    settings,
    useCallback(
      (patch: Partial<AppSetting>) => {
        setSettings((prev: AppSetting) => ({
          ...prev,
          ...patch,
        }));
      },
      [setSettings]
    ),
  ] as const;
};
