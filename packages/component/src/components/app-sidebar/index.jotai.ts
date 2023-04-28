import { atomWithStorage } from 'jotai/utils';

export const appSidebarOpenAtom = atomWithStorage(
  'app-sidebar-open',
  undefined as boolean | undefined
);
export const appSidebarWidthAtom = atomWithStorage(
  'app-sidebar-width',
  256 /* px */
);
