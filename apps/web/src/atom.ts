import type { LocalWorkspace, WorkspaceFlavour } from '@affine/workspace/type';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

type JotaiWorkspace = {
  id: string;
  flavour: WorkspaceFlavour;
};

export const jotaiWorkspacesAtom = atomWithStorage<JotaiWorkspace[]>(
  'jotai-workspaces',
  []
);

export const currentWorkspaceIdAtom = atom<JotaiWorkspace['id'] | null>(null);

export const currentWorkspaceAtom = atom<Promise<LocalWorkspace | null>>(
  async get => {
    const workspaceId = get(currentWorkspaceIdAtom);
    if (!workspaceId) {
      return null;
    }
    const workspaces = get(jotaiWorkspacesAtom);
    const workspace = workspaces.find(w => w.id === workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }
    const { flavour } = workspace;
  }
);
