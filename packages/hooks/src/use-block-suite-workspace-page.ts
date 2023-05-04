import type { Page, Workspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';

const weakMap = new WeakMap<Workspace, Atom<Page | null>>();

export function useBlockSuiteWorkspacePage(
  blockSuiteWorkspace: Workspace,
  pageId: string | null
): Page | null {
  if (!weakMap.has(blockSuiteWorkspace)) {
    const baseAtom = atom(pageId ? blockSuiteWorkspace.getPage(pageId) : null);
    baseAtom.onMount = set => {
      const disposable = blockSuiteWorkspace.slots.pageAdded.on(id => {
        if (pageId === id) {
          set(blockSuiteWorkspace.getPage(id));
        }
      });
      return () => {
        disposable.dispose();
      };
    };
    weakMap.set(blockSuiteWorkspace, baseAtom);
  }
  const pageAtom = weakMap.get(blockSuiteWorkspace);
  assertExists(pageAtom);
  return useAtomValue(pageAtom);
}
