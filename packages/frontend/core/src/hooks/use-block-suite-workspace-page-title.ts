import { assertExists } from '@blocksuite/global/utils';
import type { Workspace } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';
import { useCallback } from 'react';

import { useJournalHelper, useJournalInfoHelper } from './use-journal';

const weakMap = new WeakMap<Workspace, Map<string, Atom<string>>>();

function getAtom(w: Workspace, pageId: string): Atom<string> {
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

export function useBlockSuiteWorkspacePageTitle(
  blockSuiteWorkspace: Workspace,
  pageId: string
) {
  const titleAtom = getAtom(blockSuiteWorkspace, pageId);
  assertExists(titleAtom);
  const title = useAtomValue(titleAtom);
  const { localizedJournalDate } = useJournalInfoHelper(
    blockSuiteWorkspace,
    pageId
  );
  return localizedJournalDate || title;
}

// This hook is NOT reactive to the page title change
export function useGetBlockSuiteWorkspacePageTitle(
  blockSuiteWorkspace: Workspace
) {
  const { getLocalizedJournalDateString } =
    useJournalHelper(blockSuiteWorkspace);
  return useCallback(
    (pageId: string) => {
      return (
        getLocalizedJournalDateString(pageId) ||
        blockSuiteWorkspace.getDoc(pageId)?.meta?.title
      );
    },
    [blockSuiteWorkspace, getLocalizedJournalDateString]
  );
}
