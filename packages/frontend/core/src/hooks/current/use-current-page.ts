import {
  currentPageIdAtom,
  currentWorkspaceAtom,
} from '@toeverything/infra/atom';
import { useAtomValue } from 'jotai';

export const useCurrentPage = () => {
  const currentPageId = useAtomValue(currentPageIdAtom);
  const currentWorkspace = useAtomValue(currentWorkspaceAtom);

  return currentPageId ? currentWorkspace.getPage(currentPageId) : null;
};
