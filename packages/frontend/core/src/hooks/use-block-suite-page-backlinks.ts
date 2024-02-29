import type { Doc, Workspace } from '@blocksuite/store';
import { type Atom, atom, useAtomValue } from 'jotai';

import { useBlockSuiteWorkspacePage } from './use-block-suite-workspace-page';

const weakMap = new WeakMap<Doc, Atom<string[]>>();
function getPageBacklinks(page: Doc): string[] {
  return page.workspace.indexer.backlink
    .getBacklink(page.id)
    .map(linkNode => linkNode.pageId)
    .filter(id => id !== page.id);
}

const getPageBacklinksAtom = (page: Doc | null) => {
  if (!page) {
    return atom([]);
  }

  if (!weakMap.has(page)) {
    const baseAtom = atom<string[]>([]);
    baseAtom.onMount = set => {
      const disposables = [
        page.slots.ready.on(() => {
          set(getPageBacklinks(page));
        }),
        page.workspace.indexer.backlink.slots.indexUpdated.on(() => {
          set(getPageBacklinks(page));
        }),
      ];
      set(getPageBacklinks(page));
      return () => {
        disposables.forEach(disposable => disposable.dispose());
      };
    };
    weakMap.set(page, baseAtom);
  }
  return weakMap.get(page) as Atom<string[]>;
};

export function useBlockSuitePageBacklinks(
  blockSuiteWorkspace: Workspace,
  pageId: string
): string[] {
  const page = useBlockSuiteWorkspacePage(blockSuiteWorkspace, pageId);
  return useAtomValue(getPageBacklinksAtom(page));
}
