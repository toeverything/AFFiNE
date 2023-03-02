import { atom } from 'jotai';
import { createStore } from 'jotai/index';
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
const lockRef = {
  value: false,
  callbacks: new Set<() => void>(),
};

export const workspaceLockAtom = atom(async () => {
  if (lockRef.value) {
    return new Promise<void>(resolve => {
      const callback = () => {
        resolve();
        lockRef.callbacks.delete(callback);
      };
      lockRef.callbacks.add(callback);
    });
  } else {
    return Promise.resolve();
  }
});

export async function lockMutex(fn: () => Promise<unknown>) {
  if (lockRef.value) {
    throw new Error('Workspace is locked');
  }
  lockRef.value = true;
  lockRef.callbacks.forEach(cb => cb());
  await fn();
  lockRef.value = false;
  lockRef.callbacks.forEach(cb => cb());
}

// modal atoms
export const openWorkspacesModalAtom = atom(false);
export const openCreateWorkspaceModalAtom = atom(false);
export const openQuickSearchModalAtom = atom(false);

export const jotaiStore = createStore();
