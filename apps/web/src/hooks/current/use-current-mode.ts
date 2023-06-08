import { rootCurrentPageIdAtom } from '@affine/workspace/atom';
import { atom, useAtomValue } from 'jotai';

import { pageSettingFamily } from '../../atoms';

const currentModeAtom = atom<'page' | 'edgeless'>(get => {
  const pageId = get(rootCurrentPageIdAtom);
  // fixme(himself65): pageId should not be null
  if (!pageId) {
    return 'page';
  }
  return get(pageSettingFamily(pageId))?.mode ?? 'page';
});

export const useCurrentMode = () => {
  return useAtomValue(currentModeAtom);
};
