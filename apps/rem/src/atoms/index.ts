import { atom } from 'jotai';

// workspace necessary atoms
export const currentWorkspaceIdAtom = atom<string | null>(null);
export const currentPageIdAtom = atom<string | null>(null);
// If the workspace is locked, it means that the user maybe updating the workspace
//  from local to remote or vice versa
export const workspaceLockAtom = atom(false);

// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom(false);
export const openQuickSearchModalAtom = atom(false);
