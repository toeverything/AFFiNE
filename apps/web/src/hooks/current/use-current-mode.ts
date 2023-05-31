import { rootCurrentPageIdAtom } from '@affine/workspace/atom';
import { atom, useAtomValue } from 'jotai';

import { workspacePreferredModeAtom } from '../../atoms';

const currentModeAtom = atom<'page' | 'edgeless'>(get => {
  const pageId = get(rootCurrentPageIdAtom);
  const record = get(workspacePreferredModeAtom);
  if (pageId) return record[pageId] ?? 'page';
  else {
    return 'page';
  }
});

export const useCurrentMode = () => {
  return useAtomValue(currentModeAtom);
};
