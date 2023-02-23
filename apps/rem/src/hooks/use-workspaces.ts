import { Workspace } from '@affine/datacenter';
import { uuidv4 } from '@blocksuite/store';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { preload } from 'swr';
import { IndexeddbPersistence } from 'y-indexeddb';

import {
  AffineRemoteUnSyncedWorkspace,
  BlockSuiteWorkspace,
  fetcher,
  LocalWorkspace,
  QueryKey,
  RemWorkspace,
  RemWorkspaceFlavour,
  transformToAffineSyncedWorkspace,
} from '../shared';
import { apis } from '../shared/apis';
import { createEmptyBlockSuiteWorkspace } from '../utils';

export const dataCenter = {
  workspaces: [] as RemWorkspace[],
  callbacks: new Set<() => void>(),
};

export function vitestRefreshWorkspaces() {
  dataCenter.workspaces = [];
  dataCenter.callbacks.clear();
}

globalThis.dataCenter = dataCenter;

declare global {
  // eslint-disable-next-line no-var
  var dataCenter: unknown;
}

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
          // todo: make this `RemWorkspace`
          const remWorkspace: AffineRemoteUnSyncedWorkspace = {
            ...workspace,
            flavour: RemWorkspaceFlavour.AFFINE,
            firstBinarySynced: false,
            blockSuiteWorkspace: createEmptyBlockSuiteWorkspace(workspace.id),
            syncBinary: async () => {
              const binary = await apis.downloadWorkspace(
                workspace.id,
                workspace.public
              );
              if (remWorkspace.firstBinarySynced) {
                return;
              }
              const syncedWorkspace = await transformToAffineSyncedWorkspace(
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
          Promise.all(
            dataCenter.workspaces.map(workspace => {
              if (workspace.flavour === 'affine') {
                if (!workspace.firstBinarySynced) {
                  return workspace.syncBinary();
                }
              }
              return Promise.resolve();
            })
          );
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

export function useWorkspacesHelper() {
  return useMemo(
    () => ({
      createWorkspacePage: (workspaceId: string, pageId: string) => {
        const workspace = dataCenter.workspaces.find(
          ws => ws.id === workspaceId
        ) as LocalWorkspace;
        if (workspace && 'blockSuiteWorkspace' in workspace) {
          workspace.blockSuiteWorkspace.createPage(pageId);
        } else {
          throw new Error('cannot create page. blockSuiteWorkspace not found');
        }
      },
      createRemLocalWorkspace: (name: string): string => {
        const id = uuidv4();
        const blockSuiteWorkspace = new BlockSuiteWorkspace({
          room: id,
        });
        blockSuiteWorkspace.meta.setName(name);
        const workspace: LocalWorkspace = {
          flavour: RemWorkspaceFlavour.LOCAL,
          blockSuiteWorkspace: blockSuiteWorkspace,
          providers: [],
          syncBinary: async () => {
            const persistence = new IndexeddbPersistence(
              blockSuiteWorkspace.room as string,
              blockSuiteWorkspace.doc
            );
            return persistence.whenSynced.then(() => {
              persistence.destroy();
            });
          },
          id,
        };
        dataCenter.workspaces = [...dataCenter.workspaces, workspace];
        dataCenter.callbacks.forEach(cb => cb());
        return id;
      },
    }),
    []
  );
}
