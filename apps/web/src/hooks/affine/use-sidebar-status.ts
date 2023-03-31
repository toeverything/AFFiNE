import { atomWithSyncStorage } from '@affine/jotai';
import { atom, useAtom } from 'jotai';

const sideBarOpenAtom = atomWithSyncStorage('sidebarOpen', true);
const sideBarWidthAtom = atomWithSyncStorage('sidebarWidth', 256);
const sidebarResizingAtom = atom(false);

export function useSidebarStatus() {
  return useAtom(sideBarOpenAtom);
}

export function useSidebarWidth() {
  return useAtom(sideBarWidthAtom);
}

export function useSidebarResizing() {
  return useAtom(sidebarResizingAtom);
}
