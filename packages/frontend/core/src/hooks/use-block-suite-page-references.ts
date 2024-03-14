import type { Doc, DocCollection } from '@blocksuite/store';
import { type Atom, atom, useAtomValue } from 'jotai';

import { useDocCollectionPage } from './use-block-suite-workspace-page';

const weakMap = new WeakMap<Doc, Atom<string[]>>();
function getPageReferences(page: Doc): string[] {
  return Object.values(
    page.collection.indexer.backlink.linkIndexMap[page.id] ?? {}
  ).flatMap(linkNodes => linkNodes.map(linkNode => linkNode.pageId));
}

const getPageReferencesAtom = (page: Doc | null) => {
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
        page.collection.indexer.backlink.slots.indexUpdated.on(() => {
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
  docCollection: DocCollection,
  pageId: string
): string[] {
  const page = useDocCollectionPage(docCollection, pageId);
  return useAtomValue(getPageReferencesAtom(page));
}
