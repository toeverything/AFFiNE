import { atomWithStorage } from 'jotai/utils';

export const appSidebarOpenAtom = atomWithStorage('app-sidebar-open', true);
export const appSidebarWidthAtom = atomWithStorage(
  'app-sidebar-width',
  256 /* px */
);
