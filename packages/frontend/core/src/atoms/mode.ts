import { atom } from 'jotai/vanilla';

import { pageSettingFamily } from './index';

export const currentPageIdAtom = atom<string | null>(null);

export const currentModeAtom = atom<'page' | 'edgeless'>(get => {
  const pageId = get(currentPageIdAtom);
  if (!pageId) {
    return 'page';
  }
  return get(pageSettingFamily(pageId)).mode;
});
