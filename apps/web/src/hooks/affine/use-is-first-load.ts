import { useAtom } from 'jotai';

import { isFirstLoadAtom, openTipsAtom } from '../../atoms/first-load';

export function useIsFirstLoad() {
  const [isFirstLoad, setIsFirstLoad] = useAtom(isFirstLoadAtom);
  return [isFirstLoad, setIsFirstLoad] as const;
}
export function useOpenTips() {
  const [openTips, setOpenTips] = useAtom(openTipsAtom);
  return [openTips, setOpenTips] as const;
}
