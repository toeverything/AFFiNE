import { atomWithSyncStorage } from '@affine/jotai';
import { useMediaQuery, useTheme } from '@mui/material';
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

export function useSidebarFloating() {
  const theme = useTheme();
  return useMediaQuery(theme.breakpoints.down('md'));
}

export function useSidebarResizing() {
  return useAtom(sidebarResizingAtom);
}
