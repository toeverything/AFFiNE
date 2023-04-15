import { useTheme } from '@mui/material';
import { useMediaQuery } from '@react-hookz/web';
import { atom, useAtom } from 'jotai';
import { atomWithStorage, useHydrateAtoms } from 'jotai/utils';
import { useEffect, useRef } from 'react';

const sideBarOpenAtom = atomWithStorage('sidebarOpen', true);
const sideBarWidthAtom = atomWithStorage('sidebarWidth', 256);
const sidebarResizingAtom = atom(false);

export function useSidebarStatus() {
  useHydrateAtoms([[sideBarOpenAtom, true]]);
  const [state, setState] = useAtom(sideBarOpenAtom);
  const isFloating = useSidebarFloating();
  const onceRef = useRef(false);
  useEffect(() => {
    if (onceRef.current) {
      return;
    }
    if (isFloating && state) {
      setState(false);
      onceRef.current = true;
    }
  }, [isFloating, setState, state]);
  return [state, setState] as const;
}

export function useSidebarFloating() {
  const theme = useTheme();
  return (
    useMediaQuery(theme.breakpoints.down('md').replace(/^@media( ?)/m, ''), {
      initializeWithValue: false,
    }) ?? false
  );
}

export function useSidebarWidth() {
  return useAtom(sideBarWidthAtom);
}

export function useSidebarResizing() {
  return useAtom(sidebarResizingAtom);
}
