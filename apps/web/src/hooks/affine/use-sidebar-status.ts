import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

const sideBarOpenAtom = atomWithStorage('sidebarOpen', true);
const sideBarWidthAtom = atomWithStorage('sidebarWidth', 256);
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
