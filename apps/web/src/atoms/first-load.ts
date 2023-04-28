import { config } from '@affine/env';
import { atomWithStorage } from 'jotai/utils';

export type Visibility = Record<string, boolean>;

export const lastVersionAtom = atomWithStorage(
  'lastVersion',
  config.gitVersion
);

export const guideHiddenAtom = atomWithStorage<Visibility>('guideHidden', {});

export const guideHiddenUntilNextUpdateAtom = atomWithStorage<Visibility>(
  'guideHiddenUntilNextUpdate',
  {}
);
