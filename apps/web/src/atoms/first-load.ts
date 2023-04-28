import { atomWithStorage } from 'jotai/utils';

export type Visibility = Record<string, boolean>;

const DEFAULT_VALUE = '0.0.0';
//atomWithStorage always uses initial value when first render
//https://github.com/pmndrs/jotai/discussions/1737

function getInitialValue() {
  if (typeof window !== 'undefined') {
    const storedValue = window.localStorage.getItem('lastVersion');
    if (storedValue) {
      return JSON.parse(storedValue);
    }
  }
  return DEFAULT_VALUE;
}

export const lastVersionAtom = atomWithStorage(
  'lastVersion',
  getInitialValue()
);

export const guideHiddenAtom = atomWithStorage<Visibility>('guideHidden', {});

export const guideHiddenUntilNextUpdateAtom = atomWithStorage<Visibility>(
  'guideHiddenUntilNextUpdate',
  {}
);
