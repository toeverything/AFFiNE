import { UNTITLED_WORKSPACE_NAME } from '@affine/env/constant';
import type { Workspace } from '@blocksuite/store';
import type { Atom, WritableAtom } from 'jotai';
import { atom, useAtom } from 'jotai';

type StringAtom = WritableAtom<string, [string], void> & Atom<string>;

const weakMap = new WeakMap<Workspace, StringAtom>();

export function useBlockSuiteWorkspaceName(blockSuiteWorkspace: Workspace) {
  let nameAtom: StringAtom;
  if (!weakMap.has(blockSuiteWorkspace)) {
    const baseAtom = atom<string>(
      blockSuiteWorkspace.meta.name ?? UNTITLED_WORKSPACE_NAME
    );
    const writableAtom = atom(
      get => get(baseAtom),
      (_, set, name: string) => {
        blockSuiteWorkspace.meta.setName(name);
        set(baseAtom, name);
      }
    );
    baseAtom.onMount = set => {
      const dispose = blockSuiteWorkspace.meta.commonFieldsUpdated.on(() => {
        set(blockSuiteWorkspace.meta.name ?? '');
      });
      return () => {
        dispose.dispose();
      };
    };
    weakMap.set(blockSuiteWorkspace, writableAtom);
    nameAtom = writableAtom;
  } else {
    nameAtom = weakMap.get(blockSuiteWorkspace) as StringAtom;
  }
  return useAtom(nameAtom);
}
