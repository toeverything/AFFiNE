import { useAtom } from 'jotai';

import { currentPageIdAtom } from '../../atoms';

export function useCurrentPageMeta() {
  useAtom(currentPageIdAtom);
}
