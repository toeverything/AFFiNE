import type { PageMeta, Workspace } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';

const weakMap = new WeakMap<Workspace, Atom<PageMeta[]>>();

// this hook is extracted from './use-block-suite-page-meta.ts' to avoid circular dependency
export function useAllBlockSuitePageMeta(
  blockSuiteWorkspace: Workspace
): PageMeta[] {
  if (!weakMap.has(blockSuiteWorkspace)) {
    const baseAtom = atom<PageMeta[]>(blockSuiteWorkspace.meta.pageMetas);
    weakMap.set(blockSuiteWorkspace, baseAtom);
    baseAtom.onMount = set => {
      set(blockSuiteWorkspace.meta.pageMetas);
      const dispose = blockSuiteWorkspace.meta.pageMetasUpdated.on(() => {
        set(blockSuiteWorkspace.meta.pageMetas);
      });
      return () => {
        dispose.dispose();
      };
    };
  }
  return useAtomValue(weakMap.get(blockSuiteWorkspace) as Atom<PageMeta[]>);
}
