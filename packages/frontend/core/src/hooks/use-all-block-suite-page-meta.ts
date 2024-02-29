import type { DocMeta, Workspace } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';

const weakMap = new WeakMap<Workspace, Atom<DocMeta[]>>();

// this hook is extracted from './use-block-suite-page-meta.ts' to avoid circular dependency
export function useAllBlockSuiteDocMeta(
  blockSuiteWorkspace: Workspace
): DocMeta[] {
  if (!weakMap.has(blockSuiteWorkspace)) {
    const baseAtom = atom<DocMeta[]>(blockSuiteWorkspace.meta.docMetas);
    weakMap.set(blockSuiteWorkspace, baseAtom);
    baseAtom.onMount = set => {
      set(blockSuiteWorkspace.meta.docMetas);
      const dispose = blockSuiteWorkspace.meta.docMetaUpdated.on(() => {
        set(blockSuiteWorkspace.meta.docMetas);
      });
      return () => {
        dispose.dispose();
      };
    };
  }
  return useAtomValue(weakMap.get(blockSuiteWorkspace) as Atom<DocMeta[]>);
}
