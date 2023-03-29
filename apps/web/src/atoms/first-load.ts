import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type FirstLoad = {
  version: string;
  openTips: boolean;
  showWhatsNew: boolean;
};

export const isFirstLoadAtom = atomWithStorage<FirstLoad>('isFirstLoad', {
  version: '0.0.0',
  openTips: false,
  showWhatsNew: false,
});

export const versionAtom = atom(
  get => {
    const firstLoad = get(isFirstLoadAtom);
    return firstLoad.version;
  },
  (get, set, value: string) => {
    const firstLoad = get(isFirstLoadAtom);
    set(isFirstLoadAtom, { ...firstLoad, version: value });
  }
);

export const openTipsAtom = atom(
  get => {
    const firstLoad = get(isFirstLoadAtom);
    return firstLoad.openTips;
  },
  (get, set, value: boolean) => {
    const firstLoad = get(isFirstLoadAtom);
    set(isFirstLoadAtom, { ...firstLoad, openTips: value });
  }
);

export const showWhatsNewAtom = atom(
  get => {
    const firstLoad = get(isFirstLoadAtom);
    return firstLoad.showWhatsNew;
  },
  (get, set, value: boolean) => {
    const firstLoad = get(isFirstLoadAtom);
    set(isFirstLoadAtom, { ...firstLoad, showWhatsNew: value });
  }
);
