import type { Workspace } from '@blocksuite/store';
import { assertEquals, assertExists } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';

const weakMap = new WeakMap<Workspace, [string, Atom<string>]>();

export function useBlockSuiteWorkspacePageTitle(
  blockSuiteWorkspace: Workspace,
  pageId: string
) {
  if (
    !weakMap.has(blockSuiteWorkspace) ||
    weakMap.get(blockSuiteWorkspace)?.[0] !== pageId
  ) {
    const baseAtom = atom<string>('');
    baseAtom.onMount = set => {
      const disposable = blockSuiteWorkspace.meta.pageMetasUpdated.on(() => {
        const page = blockSuiteWorkspace.getPage(pageId);
        assertExists(page);
        set(page?.meta.title || 'Untitled');
      });
      return () => {
        disposable.dispose();
      };
    };
    weakMap.set(blockSuiteWorkspace, [pageId, baseAtom]);
  }
  const titleAtom = weakMap.get(blockSuiteWorkspace);
  assertExists(titleAtom);
  assertEquals(titleAtom[0], pageId);
  return useAtomValue(titleAtom[1]);
}
