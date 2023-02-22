import { useAtom } from 'jotai';

import { currentPageId } from '../../atoms';

export function useCurrentPageMeta() {
  useAtom(currentPageId);
}
