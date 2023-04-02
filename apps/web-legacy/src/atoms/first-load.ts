import { atomWithSyncStorage } from '@affine/jotai';

export type Visibility = Record<string, boolean>;

const DEFAULT_VALUE = '0.0.0';

export const lastVersionAtom = atomWithSyncStorage(
  'lastVersion',
  DEFAULT_VALUE
);
export const guideHiddenAtom = atomWithSyncStorage<Visibility>(
  'guideHidden',
  {}
);

export const guideHiddenUntilNextUpdateAtom = atomWithSyncStorage<Visibility>(
  'guideHiddenUntilNextUpdate',
  {}
);
