import { atomWithStorage } from 'jotai/utils';

export type Visibility = Record<string, boolean>;

const DEFAULT_VALUE = '0.0.0';

export const lastVersionAtom = atomWithStorage('lastVersion', DEFAULT_VALUE);

export const guideHiddenAtom = atomWithStorage<Visibility>('guideHidden', {});

export const guideHiddenUntilNextUpdateAtom = atomWithStorage<Visibility>(
  'guideHiddenUntilNextUpdate',
  {}
);
