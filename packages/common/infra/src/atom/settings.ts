import { DebugLogger } from '@affine/debug';
import { setupGlobal } from '@affine/env/global';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { atomEffect } from 'jotai-effect';

setupGlobal();

const logger = new DebugLogger('affine:settings');

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
  windowFrameStyle: 'frameless' | 'NativeTitleBar';
  dateFormat: DateFormats;
  startWeekOnMonday: boolean;
  enableBlurBackground: boolean;
  enableNoisyBackground: boolean;
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  enableTelemetry: boolean;
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

const appSettingBaseAtom = atomWithStorage<AppSetting>('affine-settings', {
  clientBorder: BUILD_CONFIG.isElectron && !environment.isWindows,
  windowFrameStyle: 'frameless',
  dateFormat: dateFormatOptions[0],
  startWeekOnMonday: false,
  enableBlurBackground: true,
  enableNoisyBackground: true,
  autoCheckUpdate: true,
  autoDownloadUpdate: true,
  enableTelemetry: true,
});

type SetStateAction<Value> = Value | ((prev: Value) => Value);

// todo(@pengx17): use global state instead
const appSettingEffect = atomEffect(get => {
  const settings = get(appSettingBaseAtom);
  // some values in settings should be synced into electron side
  if (BUILD_CONFIG.isElectron) {
    logger.debug('sync settings to electron', settings);
    // this api type in @affine/electron-api, but it is circular dependency this package, use any here
    (window as any).__apis?.updater
      .setConfig({
        autoCheckUpdate: settings.autoCheckUpdate,
        autoDownloadUpdate: settings.autoDownloadUpdate,
      })
      .catch((err: any) => {
        console.error(err);
      });
  }
});

export const appSettingAtom = atom<
  AppSetting,
  [SetStateAction<Partial<AppSetting>>],
  void
>(
  get => {
    get(appSettingEffect);
    return get(appSettingBaseAtom);
  },
  (_get, set, apply) => {
    set(appSettingBaseAtom, prev => {
      const next = typeof apply === 'function' ? apply(prev) : apply;
      return { ...prev, ...next };
    });
  }
);
