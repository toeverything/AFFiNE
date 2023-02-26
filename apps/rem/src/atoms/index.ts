import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

// workspace necessary atoms
export const currentWorkspaceIdAtom = atomWithStorage<string | null>(
  'affine-current-workspace-id',
  null
);
export const currentPageIdAtom = atomWithStorage<string | null>(
  'affine-current-page-id',
  null
);
// If the workspace is locked, it means that the user maybe updating the workspace
//  from local to remote or vice versa
export const workspaceLockAtom = atom(false);

// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom(false);
export const openQuickSearchModalAtom = atom(false);
