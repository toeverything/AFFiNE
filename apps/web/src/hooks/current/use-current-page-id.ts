import { Page } from '@blocksuite/store';
import { atom, useAtom, useAtomValue } from 'jotai';

import { currentPageIdAtom } from '../../atoms';
import { currentWorkspaceAtom } from './use-current-workspace';

export const currentPageAtom = atom<Promise<Page | null>>(async get => {
  const id = get(currentPageIdAtom);
  const workspace = await get(currentWorkspaceAtom);
  if (!workspace || !id) {
    return Promise.resolve(null);
  }

  const page = workspace.blockSuiteWorkspace.getPage(id);
  if (page) {
    return page;
  } else {
    return new Promise(resolve => {
      const dispose = workspace.blockSuiteWorkspace.slots.pageAdded.on(
        pageId => {
          if (pageId === id) {
            resolve(page);
            dispose.dispose();
          }
        }
      );
    });
  }
});

export function useCurrentPage(): Page | null {
  return useAtomValue(currentPageAtom);
}

/**
 * @deprecated
 */
export function useCurrentPageId(): [
  string | null,
  (newId: string | null) => void
] {
  return useAtom(currentPageIdAtom);
}
