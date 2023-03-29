import { atomWithStorage } from 'jotai/utils';

export type Visibility = Record<string, boolean>;

export const lastVersionAtom = atomWithStorage('lastVersion', '0.0.0');

export const guideHiddenAtom = atomWithStorage<Visibility>('guideHidden', {});

export const guideHiddenUntilNextUpdateAtom = atomWithStorage<Visibility>(
  'guideHiddenUntilNextUpdate',
  {}
);
