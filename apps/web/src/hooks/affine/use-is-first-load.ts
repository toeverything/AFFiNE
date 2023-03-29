import { useAtom } from 'jotai';

import {
  guideHiddenAtom,
  guideHiddenUntilNextUpdateAtom,
  lastVersionAtom,
} from '../../atoms/first-load';

export function useLastVersion() {
  const [lastVersion, setLastVersion] = useAtom(lastVersionAtom);
  return { lastVersion, setLastVersion };
}

export function useGuideHidden() {
  const [guideHidden, setGuideHidden] = useAtom(guideHiddenAtom);
  return { guideHidden, setGuideHidden };
}

export function useGuideHiddenUntilNextUpdate() {
  const [hiddenUntilNextUpdate, setHiddenUntilNextUpdate] = useAtom(
    guideHiddenUntilNextUpdateAtom
  );
  return { hiddenUntilNextUpdate, setHiddenUntilNextUpdate };
}
