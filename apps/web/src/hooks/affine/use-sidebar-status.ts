import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

const sideBarOpenAtom = atomWithStorage('sidebarOpen', true);

export function useSidebarStatus() {
  return useAtom(sideBarOpenAtom);
}
