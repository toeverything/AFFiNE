import { DebugLogger } from '@affine/debug';
import type { Workspace, WorkspaceMetadata } from '@affine/workspace';
import { workspaceManager } from '@affine/workspace-impl';
import { atom } from 'jotai';
import { atomWithObservable } from 'jotai/utils';
import { Observable } from 'rxjs';

const logger = new DebugLogger('affine:workspace:atom');

// readonly atom for workspace manager, currently only one workspace manager is supported
export const workspaceManagerAtom = atom(() => workspaceManager);

// workspace metadata list, use rxjs to push updates
export const workspaceListAtom = atomWithObservable<WorkspaceMetadata[]>(
  get => {
    const workspaceManager = get(workspaceManagerAtom);
    return new Observable<WorkspaceMetadata[]>(subscriber => {
      subscriber.next(workspaceManager.list.workspaceList);
      return workspaceManager.list.onStatusChanged.on(status => {
        subscriber.next(status.workspaceList);
      }).dispose;
    });
  },
  {
    initialValue: [],
  }
);

// workspace list loading status, if is false, UI can display not found page when workspace id is not in the list.
export const workspaceListLoadingStatusAtom = atomWithObservable<boolean>(
  get => {
    const workspaceManager = get(workspaceManagerAtom);
    return new Observable<boolean>(subscriber => {
      subscriber.next(workspaceManager.list.status.loading);
      return workspaceManager.list.onStatusChanged.on(status => {
        subscriber.next(status.loading);
      }).dispose;
    });
  },
  {
    initialValue: true,
  }
);

// current workspace
export const currentWorkspaceAtom = atom<Workspace | null>(null);

// wait for current workspace, if current workspace is null, it will suspend
export const waitForCurrentWorkspaceAtom = atom(get => {
  const currentWorkspace = get(currentWorkspaceAtom);
  if (!currentWorkspace) {
    // suspended
    logger.info('suspended for current workspace');
    return new Promise<Workspace>(_ => {});
  }
  return currentWorkspace;
});
