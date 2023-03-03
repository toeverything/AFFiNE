import { atom } from 'jotai';
import { createStore } from 'jotai';
import { unstable_batchedUpdates } from 'react-dom';

// workspace necessary atoms
export const currentWorkspaceIdAtom = atom<string | null>(null);
export const currentPageIdAtom = atom<string | null>(null);
// If the workspace is locked, it means that the user maybe updating the workspace
//  from local to remote or vice versa
export const workspaceLockAtom = atom(false);
export async function lockMutex(fn: () => Promise<unknown>) {
  if (jotaiStore.get(workspaceLockAtom)) {
    throw new Error('Workspace is locked');
  }
  unstable_batchedUpdates(() => {
    jotaiStore.set(workspaceLockAtom, true);
  });
  await fn();
  unstable_batchedUpdates(() => {
    jotaiStore.set(workspaceLockAtom, false);
  });
}

// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom(false);
export const openQuickSearchModalAtom = atom(false);

export const jotaiStore = createStore();
