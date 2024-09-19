import { assertExists } from '@blocksuite/global/utils';
import type { DocCollection } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';
import { useCallback } from 'react';

import { useJournalInfoHelper } from './use-journal';

const weakMap = new WeakMap<DocCollection, Map<string, Atom<string>>>();

function getAtom(w: DocCollection, pageId: string): Atom<string> {
  if (!weakMap.has(w)) {
    weakMap.set(w, new Map());
  }
  const map = weakMap.get(w);
  assertExists(map);
  if (!map.has(pageId)) {
    const baseAtom = atom<string>(w.getDoc(pageId)?.meta?.title || 'Untitled');
    baseAtom.onMount = set => {
      const disposable = w.meta.docMetaUpdated.on(() => {
        const page = w.getDoc(pageId);
        set(page?.meta?.title || 'Untitled');
      });
      return () => {
        disposable.dispose();
      };
    };
    map.set(pageId, baseAtom);
    return baseAtom;
  } else {
    return map.get(pageId) as Atom<string>;
  }
}

/**
 * @deprecated use `useDocTitle(docId: string)` instead
 */
export function useDocCollectionPageTitle(
  docCollection: DocCollection,
  pageId: string
) {
  const titleAtom = getAtom(docCollection, pageId);
  assertExists(titleAtom);
  const title = useAtomValue(titleAtom);
  const { localizedJournalDate } = useJournalInfoHelper(pageId);
  return localizedJournalDate || title;
}

// This hook is NOT reactive to the page title change
export function useGetDocCollectionPageTitle(docCollection: DocCollection) {
  const { getLocalizedJournalDateString } = useJournalInfoHelper();
  return useCallback(
    (pageId: string) => {
      return (
        getLocalizedJournalDateString(pageId) ||
        docCollection.getDoc(pageId)?.meta?.title
      );
    },
    [docCollection, getLocalizedJournalDateString]
  );
}
