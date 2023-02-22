import { Workspace } from '@affine/datacenter';
import { useCallback, useSyncExternalStore } from 'react';
import { preload } from 'swr';

import {
  fetcher,
  QueryKey,
  RemWorkspace,
  transformToSyncedWorkspace,
} from '../shared';
import { apis } from '../shared/apis';

let localWorkspaces: RemWorkspace[] = [];
export const callback = new Set<() => void>();
const kWorkspaces = 'affine-workspaces';

if (typeof window !== 'undefined') {
  localWorkspaces = [
    ...localWorkspaces,
    ...(JSON.parse(
      localStorage.getItem(kWorkspaces) ?? '[]'
    ) as RemWorkspace[]),
  ];
  callback.forEach(cb => cb());
}

const emptyWorkspaces: RemWorkspace[] = [];

export function prefetchNecessaryData() {
  const promise: Promise<Workspace[]> = preload(
    QueryKey.getWorkspaces,
    fetcher
  );
  promise
    .then(workspaces => {
      workspaces.forEach(workspace => {
        const exist = localWorkspaces.find(
          localWorkspace => localWorkspace.id === workspace.id
        );
        if (!exist) {
          const remWorkspace: RemWorkspace = {
            ...workspace,
            firstBinarySynced: false,
            syncBinary: async () => {
              const binary = await apis.downloadWorkspace(
                workspace.id,
                workspace.public
              );
              if (remWorkspace.firstBinarySynced) {
                return;
              }
              const syncedWorkspace = transformToSyncedWorkspace(
                remWorkspace,
                binary
              );
              const index = localWorkspaces.findIndex(
                ws => ws.id === syncedWorkspace.id
              );
              if (index > -1) {
                localWorkspaces.splice(index, 1, syncedWorkspace);
                localWorkspaces = [...localWorkspaces];
                callback.forEach(cb => cb());
              }
            },
          };
          localWorkspaces = [...localWorkspaces, remWorkspace];
          callback.forEach(cb => cb());
        }
      });
    })
    .catch(error => {
      console.error(error);
    });
}

export function useWorkspaces(): RemWorkspace[] {
  return useSyncExternalStore(
    useCallback(onStoreChange => {
      callback.add(onStoreChange);
      return () => {
        callback.delete(onStoreChange);
      };
    }, []),
    useCallback(() => localWorkspaces, []),
    useCallback(() => emptyWorkspaces, [])
  );
}
