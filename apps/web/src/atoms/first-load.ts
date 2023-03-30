import { atomWithStorage } from 'jotai/utils';

export type Visibility = Record<string, boolean>;

export const DEFAULT_VERSION = '0.0.0';

export const lastVersionAtom = atomWithStorage('lastVersion', DEFAULT_VERSION);
export const guideHiddenAtom = atomWithStorage<Visibility>('guideHidden', {});

export const guideHiddenUntilNextUpdateAtom = atomWithStorage<Visibility>(
  'guideHiddenUntilNextUpdate',
  {}
);
