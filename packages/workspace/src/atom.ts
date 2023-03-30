import type { WorkspaceFlavour } from '@affine/workspace/type';
import { createStore } from 'jotai/index';
import { atomWithStorage } from 'jotai/utils';

export type JotaiWorkspace = {
  id: string;
  flavour: WorkspaceFlavour;
};

// root primitive atom that stores the list of workspaces which could be used in the app
// if a workspace is not in this list, it should not be used in the app
export const jotaiWorkspacesAtom = atomWithStorage<JotaiWorkspace[]>(
  'jotai-workspaces',
  []
);

// global jotai store, which is used to store all the atoms
export const jotaiStore = createStore();
