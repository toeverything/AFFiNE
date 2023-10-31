import {
  type AffineOfficialWorkspace,
  WorkspaceFlavour,
} from '@affine/env/workspace';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import type { Workspace } from '@blocksuite/store';
import { getBlockSuiteWorkspaceAtom } from '@toeverything/infra/__internal__/workspace';
import type { Atom } from 'jotai';
import { atom, useAtomValue } from 'jotai';

const workspaceWeakMap = new WeakMap<
  Workspace,
  Atom<Promise<AffineOfficialWorkspace>>
>();

// workspace effect is the side effect like connect to the server/indexeddb,
//  this will save the workspace updates permanently.
export function useWorkspaceEffect(workspaceId: string): void {
  const [, effectAtom] = getBlockSuiteWorkspaceAtom(workspaceId);
  useAtomValue(effectAtom);
}

// todo(himself65): remove this hook
export function useWorkspace(workspaceId: string): AffineOfficialWorkspace {
  const [workspaceAtom] = getBlockSuiteWorkspaceAtom(workspaceId);
  const workspace = useAtomValue(workspaceAtom);
  if (!workspaceWeakMap.has(workspace)) {
    const baseAtom = atom(async get => {
      const metadataList = await get(rootWorkspacesMetadataAtom);
      const flavour = metadataList.find(({ id }) => id === workspaceId)
        ?.flavour;

      if (!flavour) {
        // when last workspace is removed, we may encounter this warning. it should be fine
        console.warn(
          'workspace not found in rootWorkspacesMetadataAtom, maybe it is removed',
          workspaceId
        );
      }

      return {
        id: workspaceId,
        flavour: flavour ?? WorkspaceFlavour.LOCAL,
        blockSuiteWorkspace: workspace,
      };
    });
    workspaceWeakMap.set(workspace, baseAtom);
  }

  return useAtomValue(
    workspaceWeakMap.get(workspace) as Atom<Promise<AffineOfficialWorkspace>>
  );
}
