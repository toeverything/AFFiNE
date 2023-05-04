import { UNTITLED_WORKSPACE_NAME } from '@affine/env';
import type { Workspace } from '@blocksuite/store';
import { assertExists } from '@blocksuite/store';
import type { Atom, WritableAtom } from 'jotai';
import { atom, useAtom } from 'jotai';

const weakMap = new WeakMap<
  Workspace,
  WritableAtom<string, [string], void> & Atom<string>
>();

export function useBlockSuiteWorkspaceName(blockSuiteWorkspace: Workspace) {
  if (!weakMap.has(blockSuiteWorkspace)) {
    const baseAtom = atom<string>(
      blockSuiteWorkspace.meta.name ?? UNTITLED_WORKSPACE_NAME
    );
    const writableAtom = atom(
      get => get(baseAtom),
      (get, set, name: string) => {
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
  }
  const nameAtom = weakMap.get(blockSuiteWorkspace);
  assertExists(nameAtom);
  return useAtom(nameAtom);
}
