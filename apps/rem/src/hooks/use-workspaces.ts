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

export const dataCenter = {
  workspaces: [] as RemWorkspace[],
  callbacks: new Set<() => void>(),
};

const kWorkspaces = 'affine-workspaces';

if (typeof window !== 'undefined') {
  dataCenter.workspaces = [
    ...dataCenter.workspaces,
    ...(JSON.parse(
      localStorage.getItem(kWorkspaces) ?? '[]'
    ) as RemWorkspace[]),
  ];
  dataCenter.callbacks.forEach(cb => cb());
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
        const exist = dataCenter.workspaces.find(
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
              const index = dataCenter.workspaces.findIndex(
                ws => ws.id === syncedWorkspace.id
              );
              if (index > -1) {
                dataCenter.workspaces.splice(index, 1, syncedWorkspace);
                dataCenter.workspaces = [...dataCenter.workspaces];
                dataCenter.callbacks.forEach(cb => cb());
              }
            },
          };
          dataCenter.workspaces = [...dataCenter.workspaces, remWorkspace];
          dataCenter.callbacks.forEach(cb => cb());
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
      dataCenter.callbacks.add(onStoreChange);
      return () => {
        dataCenter.callbacks.delete(onStoreChange);
      };
    }, []),
    useCallback(() => dataCenter.workspaces, []),
    useCallback(() => emptyWorkspaces, [])
  );
}
