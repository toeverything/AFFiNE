import { atomWithStorage } from 'jotai/utils';

export type Visibility = Record<string, boolean>;

const DEFAULT_VALUE = '0.0.0';
//atomWithStorage always uses initial value when first render
//https://github.com/pmndrs/jotai/discussions/1737
export const lastVersionAtom = atomWithStorage(
  'lastVersion',
  JSON.parse(
    globalThis.localStorage?.getItem('lastVersion') ??
      JSON.stringify(DEFAULT_VALUE)
  )
);

export const guideHiddenAtom = atomWithStorage<Visibility>('guideHidden', {});

export const guideHiddenUntilNextUpdateAtom = atomWithStorage<Visibility>(
  'guideHiddenUntilNextUpdate',
  {}
);
