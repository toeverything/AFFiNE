import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export const APP_SIDEBAR_OPEN = 'app-sidebar-open';
export const isMobile = !BUILD_CONFIG.isElectron && window.innerWidth < 768;

export const appSidebarOpenAtom = atomWithStorage(APP_SIDEBAR_OPEN, !isMobile);
export const appSidebarFloatingAtom = atom(isMobile);

export const appSidebarResizingAtom = atom(false);
export const appSidebarWidthAtom = atomWithStorage(
  'app-sidebar-width',
  248 /* px */
);
