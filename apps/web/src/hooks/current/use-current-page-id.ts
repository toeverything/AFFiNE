import type { LocalIndexedDBProvider } from '@affine/workspace/type';
import type { Page } from '@blocksuite/store';
import { atom, useAtom, useAtomValue } from 'jotai';

import { currentPageIdAtom } from '../../atoms';
import { currentWorkspaceAtom } from './use-current-workspace';

export const currentPageAtom = atom<Promise<Page | null>>(async get => {
  const id = get(currentPageIdAtom);
  const workspace = await get(currentWorkspaceAtom);
  if (!workspace || !id) {
    return Promise.resolve(null);
  }
  const provider = workspace.providers.find(
    provider => provider.flavour === 'local-indexeddb'
  );
  if (provider) {
    const localProvider = provider as LocalIndexedDBProvider;
    await localProvider.whenSynced;
  }

  return workspace.blockSuiteWorkspace.getPage(id);
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
