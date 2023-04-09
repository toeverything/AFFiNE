import { config } from '@affine/env';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useEffect } from 'react';

import {
  guideHiddenAtom,
  guideHiddenUntilNextUpdateAtom,
  lastVersionAtom,
} from '../atoms/first-load';

export function useLastVersion() {
  return useAtom(lastVersionAtom);
}

export function useGuideHidden() {
  return useAtom(guideHiddenAtom);
}

export function useGuideHiddenUntilNextUpdate() {
  return useAtom(guideHiddenUntilNextUpdateAtom);
}

const TIPS = {
  quickSearchTips: true,
  changeLog: true,
};

export function useTipsDisplayStatus() {
  const permanentlyHiddenTips = useAtomValue(guideHiddenAtom);
  const hiddenUntilNextUpdateTips = useAtomValue(
    guideHiddenUntilNextUpdateAtom
  );

  return {
    quickSearchTips: {
      permanentlyHidden: permanentlyHiddenTips.quickSearchTips || true,
      hiddenUntilNextUpdate: hiddenUntilNextUpdateTips.quickSearchTips || true,
    },
    changeLog: {
      permanentlyHidden: permanentlyHiddenTips.changeLog || true,
      hiddenUntilNextUpdate: hiddenUntilNextUpdateTips.changeLog || true,
    },
  };
}

export function useUpdateTipsOnVersionChange() {
  const [lastVersion, setLastVersion] = useLastVersion();
  const currentVersion = config.gitVersion;
  const tipsDisplayStatus = useTipsDisplayStatus();
  const setPermanentlyHiddenTips = useSetAtom(guideHiddenAtom);
  const setHiddenUntilNextUpdateTips = useSetAtom(
    guideHiddenUntilNextUpdateAtom
  );

  useEffect(() => {
    if (lastVersion !== currentVersion) {
      setLastVersion(currentVersion);
      const newHiddenUntilNextUpdateTips = { ...TIPS };
      const newPermanentlyHiddenTips = { ...TIPS, changeLog: false };
      Object.keys(tipsDisplayStatus).forEach(tipKey => {
        newHiddenUntilNextUpdateTips[tipKey as keyof typeof TIPS] = false;
      });
      setHiddenUntilNextUpdateTips(newHiddenUntilNextUpdateTips);
      setPermanentlyHiddenTips(newPermanentlyHiddenTips);
    }
  }, [
    currentVersion,
    lastVersion,
    setLastVersion,
    setPermanentlyHiddenTips,
    setHiddenUntilNextUpdateTips,
    tipsDisplayStatus,
  ]);
}
