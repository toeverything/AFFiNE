import { DebugLogger } from '@affine/debug';
import { setupGlobal } from '@affine/env/global';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { atomEffect } from 'jotai-effect';

setupGlobal();

const logger = new DebugLogger('affine:settings');

export type AppSetting = {
  clientBorder: boolean;
  windowFrameStyle: 'frameless' | 'NativeTitleBar';
  enableBlurBackground: boolean;
  enableNoisyBackground: boolean;
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  enableTelemetry: boolean;
  showLinkedDocInSidebar: boolean;
  disableImageAntialiasing: boolean;
};
export const windowFrameStyleOptions: AppSetting['windowFrameStyle'][] = [
  'frameless',
  'NativeTitleBar',
];

export const APP_SETTINGS_STORAGE_KEY = 'affine-settings';
const appSettingBaseAtom = atomWithStorage<AppSetting>(
  APP_SETTINGS_STORAGE_KEY,
  {
    clientBorder: BUILD_CONFIG.isElectron && !environment.isWindows,
    windowFrameStyle: 'frameless',
    enableBlurBackground: BUILD_CONFIG.isElectron && environment.isMacOs,
    enableNoisyBackground: true,
    autoCheckUpdate: true,
    autoDownloadUpdate: true,
    enableTelemetry: true,
    showLinkedDocInSidebar: true,
    disableImageAntialiasing: false,
  },
  undefined,
  {
    getOnInit: true,
  }
);

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
