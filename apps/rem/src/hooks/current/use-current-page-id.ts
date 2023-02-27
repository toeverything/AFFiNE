import { useAtom } from 'jotai';

import { currentPageIdAtom } from '../../atoms';

export function useCurrentPageId(): [
  string | null,
  (newId: string | null) => void
] {
  return useAtom(currentPageIdAtom);
}
