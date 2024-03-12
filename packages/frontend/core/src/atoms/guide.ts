// these atoms cannot be moved to @affine/jotai since they use atoms from @affine/component
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

import { appSidebarOpenAtom } from '../components/app-sidebar';

export type Guide = {
  // should show quick search tips
  quickSearchTips: boolean;
  // should show change log
  changeLog: boolean;
  // should show recording tips
  onBoarding: boolean;
  // should show download client tips
  downloadClientTip: boolean;
};

const guidePrimitiveAtom = atomWithStorage<Guide>('helper-guide', {
  quickSearchTips: true,
  changeLog: true,
  onBoarding: true,
  downloadClientTip: true,
});

export const guideQuickSearchTipsAtom = atom<
  Guide['quickSearchTips'],
  [open: boolean],
  void
>(
  get => {
    const open = get(appSidebarOpenAtom);
    const guide = get(guidePrimitiveAtom);
    // only show the tips when the sidebar is closed
    return guide.quickSearchTips && open === false;
  },
  (_, set, open) => {
    set(guidePrimitiveAtom, tips => ({
      ...tips,
      quickSearchTips: open,
    }));
  }
);

export const guideChangeLogAtom = atom<
  Guide['changeLog'],
  [open: boolean],
  void
>(
  get => {
    return get(guidePrimitiveAtom).changeLog;
  },
  (_, set, open) => {
    set(guidePrimitiveAtom, tips => ({
      ...tips,
      changeLog: open,
    }));
  }
);

export const guideDownloadClientTipAtom = atom<
  Guide['downloadClientTip'],
  [open: boolean],
  void
>(
  get => {
    if (environment.isDesktop) {
      return false;
    }
    return get(guidePrimitiveAtom).downloadClientTip;
  },
  (_, set, open) => {
    set(guidePrimitiveAtom, tips => ({
      ...tips,
      downloadClientTip: open,
    }));
  }
);
