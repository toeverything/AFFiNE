import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const APP_SIDEBAR_OPEN = 'app-sidebar-open';
export const appSidebarOpenAtom = atomWithStorage(
  APP_SIDEBAR_OPEN,
  undefined as boolean | undefined
);
export const appSidebarFloatingAtom = atom(false);

export const appSidebarResizingAtom = atom(false);
export const appSidebarWidthAtom = atomWithStorage(
  'app-sidebar-width',
  256 /* px */
);
