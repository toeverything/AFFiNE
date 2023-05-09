import type { Workspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';

const weakMap = new WeakMap<Workspace, Map<string, Atom<string>>>();

function getAtom(w: Workspace, pageId: string): Atom<string> {
  if (!weakMap.has(w)) {
    weakMap.set(w, new Map());
  }
  const map = weakMap.get(w);
  assertExists(map);
  if (!map.has(pageId)) {
    const baseAtom = atom<string>(w.getPage(pageId)?.meta.title || 'Untitled');
    baseAtom.onMount = set => {
      const disposable = w.meta.pageMetasUpdated.on(() => {
        const page = w.getPage(pageId);
        set(page?.meta.title || 'Untitled');
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
  return useAtomValue(titleAtom);
}
