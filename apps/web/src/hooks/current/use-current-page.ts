import { assertExists, Page } from '@blocksuite/store';
import { atom, useAtomValue } from 'jotai';

import { currentPageIdAtom } from '../../atoms';
import { currentWorkspaceAtom } from './use-current-workspace';

const currentPageAtom = atom<Page | null | Promise<Page | null>>(async get => {
  const id = get(currentPageIdAtom);
  const currentWorkspace = await get(currentWorkspaceAtom);
  if (currentWorkspace === null || id === null) {
    return null;
  } else {
    const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
    const page = blockSuiteWorkspace.getPage(id);
    if (page === null) {
      return new Promise<Page>(resolve => {
        const callback = (pageId: string) => {
          if (pageId === id) {
            const page = blockSuiteWorkspace.getPage(id);
            assertExists(page);
            resolve(page);
            dispose.dispose();
          }
        };
        const dispose = blockSuiteWorkspace.signals.pageAdded.on(callback);
      });
    }
    return page;
  }
});

export function useCurrentPage(): Page | null {
  return useAtomValue(currentPageAtom);
}
