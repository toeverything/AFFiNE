import { atom, useAtomValue } from 'jotai';

import { currentPageIdAtom, workspacePreferredModeAtom } from '../../atoms';

const currentModeAtom = atom<'page' | 'edgeless'>(get => {
  const pageId = get(currentPageIdAtom);
  const record = get(workspacePreferredModeAtom);
  if (pageId) return record[pageId] ?? 'page';
  else {
    return 'page';
  }
});

export const useCurrentMode = () => {
  return useAtomValue(currentModeAtom);
};
