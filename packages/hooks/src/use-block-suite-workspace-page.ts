import type { Page, Workspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';

const weakMap = new WeakMap<Workspace, Map<string, Atom<Page | null>>>();

const emptyAtom = atom<Page | null>(null);

function getAtom(w: Workspace, pageId: string | null): Atom<Page | null> {
  if (!pageId) {
    return emptyAtom;
  }
  if (!weakMap.has(w)) {
    weakMap.set(w, new Map());
  }
  const map = weakMap.get(w);
  assertExists(map);
  if (!map.has(pageId)) {
    const baseAtom = atom<Page | null>(w.getPage(pageId));
    if (!weakMap.has(w)) {
      const baseAtom = atom(w.getPage(pageId));
      baseAtom.onMount = set => {
        const disposable = w.slots.pageAdded.on(id => {
          if (pageId === id) {
            set(w.getPage(id));
          }
        });
        return () => {
          disposable.dispose();
        };
      };
      map.set(pageId, baseAtom);
    }
    return baseAtom;
  } else {
    return map.get(pageId) as Atom<Page | null>;
  }
}

export function useBlockSuiteWorkspacePage(
  blockSuiteWorkspace: Workspace,
  pageId: string | null
): Page | null {
  const pageAtom = getAtom(blockSuiteWorkspace, pageId);
  assertExists(pageAtom);
  return useAtomValue(pageAtom);
}
