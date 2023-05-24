import type { Page, Workspace } from '@blocksuite/store';
import { atom, useAtomValue } from 'jotai';
import { atomFamily } from 'jotai/utils';

import { useBlockSuiteWorkspacePage } from './use-block-suite-workspace-page';

function getPageReferences(page: Page): string[] {
  // todo: is there a way to use page indexer to get all references?
  return page
    .getBlockByFlavour('affine:paragraph')
    .flatMap(b => b.text?.toDelta())
    .map(v => v?.attributes?.reference?.pageId)
    .filter(Boolean);
}

const pageReferencesAtomFamily = atomFamily((page: Page | null) => {
  if (page === null) {
    return atom([]);
  }
  const baseAtom = atom<string[]>(getPageReferences(page));
  baseAtom.onMount = set => {
    const dispose = page.slots.yUpdated.on(() => {
      set(getPageReferences(page));
    });
    return () => {
      dispose.dispose();
    };
  };
  return baseAtom;
});

export function useBlockSuitePageReferences(
  blockSuiteWorkspace: Workspace,
  pageId: string
): string[] {
  const page = useBlockSuiteWorkspacePage(blockSuiteWorkspace, pageId);
  return useAtomValue(pageReferencesAtomFamily(page));
}
