import { rootCurrentPageIdAtom } from '@affine/workspace/atom';
import { assertExists } from '@blocksuite/store';
import { atom, useAtomValue } from 'jotai';

import { pageSettingFamily } from '../../atoms';

const currentModeAtom = atom<'page' | 'edgeless'>(get => {
  const pageId = get(rootCurrentPageIdAtom);
  assertExists(pageId);
  return get(pageSettingFamily(pageId))?.mode ?? 'page';
});

export const useCurrentMode = () => {
  return useAtomValue(currentModeAtom);
};
