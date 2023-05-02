// these atoms cannot be moved to @affine/jotai since they use atoms from @affine/component
import { appSidebarOpenAtom } from '@affine/component/app-sidebar';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

export type Guide = {
  // should show quick search tips
  quickSearchTips: boolean;
  // should show change log
  changeLog: boolean;
  // should show recording tips
  onBoarding: boolean;
};

const guidePrimitiveAtom = atomWithStorage<Guide>('helper-guide', {
  quickSearchTips: true,
  changeLog: true,
  onBoarding: true,
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
