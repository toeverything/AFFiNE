import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

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
  fontStyle: FontFamily;
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

export type FontFamily = 'Sans' | 'Serif' | 'Mono';

export const fontStyleOptions = [
  { key: 'Sans', value: 'var(--affine-font-sans-family)' },
  { key: 'Serif', value: 'var(--affine-font-serif-family)' },
  { key: 'Mono', value: 'var(--affine-font-mono-family)' },
] satisfies {
  key: FontFamily;
  value: string;
}[];

const appSettingBaseAtom = atomWithStorage<AppSetting>('affine-settings', {
  clientBorder: environment.isDesktop && globalThis.platform !== 'win32',
  fullWidthLayout: false,
  windowFrameStyle: 'frameless',
  fontStyle: 'Sans',
  dateFormat: dateFormatOptions[0],
  startWeekOnMonday: false,
  enableBlurBackground: true,
  enableNoisyBackground: true,
  autoCheckUpdate: true,
  autoDownloadUpdate: true,
});

type SetStateAction<Value> = Value | ((prev: Value) => Value);

const appSettingAtom = atom<
  AppSetting,
  [SetStateAction<Partial<AppSetting>>],
  void
>(
  get => get(appSettingBaseAtom),
  (get, set, apply) => {
    const prev = get(appSettingBaseAtom);
    const next = typeof apply === 'function' ? apply(prev) : apply;
    set(appSettingBaseAtom, { ...prev, ...next });
  }
);

export const useAppSetting = () => {
  return useAtom(appSettingAtom);
};
