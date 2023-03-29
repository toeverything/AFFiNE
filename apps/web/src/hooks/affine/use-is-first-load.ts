import { useAtom } from 'jotai';

import {
  isFirstLoadAtom,
  openTipsAtom,
  showWhatsNewAtom,
  versionAtom,
} from '../../atoms/first-load';

export function useIsFirstLoad() {
  const [isFirstLoad, setIsFirstLoad] = useAtom(isFirstLoadAtom);
  return [isFirstLoad, setIsFirstLoad] as const;
}
export function useFirstLoadVersion() {
  const [version, setVersion] = useAtom(versionAtom);
  return [version, setVersion] as const;
}
export function useOpenTips() {
  const [openTips, setOpenTips] = useAtom(openTipsAtom);
  return [openTips, setOpenTips] as const;
}
export function useShowWhatsNew() {
  const [showWhatsNew, setShowWhatsNews] = useAtom(showWhatsNewAtom);
  return [showWhatsNew, setShowWhatsNews] as const;
}
