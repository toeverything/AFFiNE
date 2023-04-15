import { useTheme } from '@mui/material';
import { useMediaQuery } from '@react-hookz/web';
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

export function useSidebarFloating() {
  const theme = useTheme();
  return (
    useMediaQuery(theme.breakpoints.down('md').replace(/^@media( ?)/m, '')) ??
    false
  );
}

export function useSidebarResizing() {
  return useAtom(sidebarResizingAtom);
}
