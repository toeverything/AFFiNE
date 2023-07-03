import type { PropertiesMeta } from '@affine/env/filter';
import type { Workspace } from '@blocksuite/store';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';

const weakMap = new WeakMap<Workspace, Atom<PropertiesMeta>>();

export function useBlockSuitePropertiesMeta(
  blockSuiteWorkspace: Workspace
): PropertiesMeta {
  if (!weakMap.has(blockSuiteWorkspace)) {
    const baseAtom = atom<PropertiesMeta>(blockSuiteWorkspace.meta.properties);
    weakMap.set(blockSuiteWorkspace, baseAtom);
    baseAtom.onMount = set => {
      const dispose = blockSuiteWorkspace.meta.pageMetasUpdated.on(() => {
        set(blockSuiteWorkspace.meta.properties);
      });
      return () => {
        dispose.dispose();
      };
    };
  }
  return useAtomValue(weakMap.get(blockSuiteWorkspace) as Atom<PropertiesMeta>);
}
