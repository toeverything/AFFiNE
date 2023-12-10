import type { Page, Workspace } from '@blocksuite/store';
import { type Atom, atom, useAtomValue } from 'jotai';

import { useBlockSuiteWorkspacePage } from './use-block-suite-workspace-page';

const weakMap = new WeakMap<Page, Atom<string[]>>();
function getPageReferences(page: Page): string[] {
  return Object.values(
    page.workspace.indexer.backlink.linkIndexMap[page.id] ?? {}
  ).flatMap(linkNodes => linkNodes.map(linkNode => linkNode.pageId));
}

const getPageReferencesAtom = (page: Page | null) => {
  if (!page) {
    return atom([]);
  }

  if (!weakMap.has(page)) {
    const baseAtom = atom<string[]>([]);
    baseAtom.onMount = set => {
      const disposables = [
        page.slots.ready.on(() => {
          set(getPageReferences(page));
        }),
        page.workspace.indexer.backlink.slots.indexUpdated.on(() => {
          set(getPageReferences(page));
        }),
      ];
      set(getPageReferences(page));
      return () => {
        disposables.forEach(disposable => disposable.dispose());
      };
    };
    weakMap.set(page, baseAtom);
  }
  return weakMap.get(page) as Atom<string[]>;
};

export function useBlockSuitePageReferences(
  blockSuiteWorkspace: Workspace,
  pageId: string
): string[] {
  const page = useBlockSuiteWorkspacePage(blockSuiteWorkspace, pageId);
  return useAtomValue(getPageReferencesAtom(page));
}
