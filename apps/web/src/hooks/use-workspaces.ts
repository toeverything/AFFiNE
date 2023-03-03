import { Workspace } from '@affine/datacenter';
import { config, getEnvironment } from '@affine/env';
import { nanoid } from '@blocksuite/store';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import useSWR from 'swr';

import { lockMutex } from '../atoms';
import { createLocalProviders } from '../blocksuite';
import { WorkspacePlugins } from '../plugins';
import { QueryKey } from '../plugins/affine/fetcher';
import { kStoreKey } from '../plugins/local';
import { LocalWorkspace, RemWorkspace, RemWorkspaceFlavour } from '../shared';
import { createEmptyBlockSuiteWorkspace } from '../utils';

// fixme(himself65): refactor with jotai atom using async
export const dataCenter = {
  workspaces: [] as RemWorkspace[],
  isLoaded: false,
  callbacks: new Set<() => void>(),
};

export function vitestRefreshWorkspaces() {
  dataCenter.workspaces = [];
  dataCenter.callbacks.clear();
}

declare global {
  // eslint-disable-next-line no-var
  var dataCenter: {
    workspaces: RemWorkspace[];
    isLoaded: boolean;
    callbacks: Set<() => void>;
  };
}

globalThis.dataCenter = dataCenter;

function createRemLocalWorkspace(name: string) {
  const id = nanoid();
  const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(
    id,
    (_: string) => undefined
  );
  blockSuiteWorkspace.meta.setName(name);
  const workspace: LocalWorkspace = {
    flavour: RemWorkspaceFlavour.LOCAL,
    blockSuiteWorkspace: blockSuiteWorkspace,
    providers: [...createLocalProviders(blockSuiteWorkspace)],
    id,
  };
  if (config.enableIndexedDBProvider) {
    let ids: string[];
    try {
      ids = JSON.parse(localStorage.getItem(kStoreKey) ?? '[]');
      if (!Array.isArray(ids)) {
        localStorage.setItem(kStoreKey, '[]');
        ids = [];
      }
    } catch (e) {
      localStorage.setItem(kStoreKey, '[]');
      ids = [];
    }
    ids.push(id);
    localStorage.setItem(kStoreKey, JSON.stringify(ids));
  }
  dataCenter.workspaces = [...dataCenter.workspaces, workspace];
  dataCenter.callbacks.forEach(cb => cb());
  return id;
}

const emptyWorkspaces: RemWorkspace[] = [];

export async function refreshDataCenter(signal?: AbortSignal) {
  dataCenter.isLoaded = false;
  dataCenter.callbacks.forEach(cb => cb());
  if (getEnvironment().isServer) {
    return;
  }
  // fixme(himself65): `prefetchWorkspace` is not used
  //  use `config.enablePlugin = ['affine', 'local']` instead
  // if (!config.prefetchWorkspace) {
  //   console.info('prefetchNecessaryData: skip prefetching');
  //   return;
  // }
  const plugins = Object.values(WorkspacePlugins).sort(
    (a, b) => a.loadPriority - b.loadPriority
  );
  // prefetch data in order
  for (const plugin of plugins) {
    console.info('prefetchNecessaryData: plugin', plugin.flavour);
    try {
      if (signal?.aborted) {
        break;
      }
      const oldData = dataCenter.workspaces;
      await plugin.prefetchData(dataCenter, signal);
      const newData = dataCenter.workspaces;
      if (!Object.is(oldData, newData)) {
        console.info('prefetchNecessaryData: data changed');
      }
    } catch (e) {
      console.error('error prefetch data', plugin.flavour, e);
    }
  }
  dataCenter.isLoaded = true;
  dataCenter.callbacks.forEach(cb => cb());
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

export function useWorkspacesIsLoaded(): boolean {
  return useSyncExternalStore(
    useCallback(onStoreChange => {
      dataCenter.callbacks.add(onStoreChange);
      return () => {
        dataCenter.callbacks.delete(onStoreChange);
      };
    }, []),
    useCallback(() => dataCenter.isLoaded, []),
    useCallback(() => true, [])
  );
}

export function useSyncWorkspaces() {
  return useSWR<Workspace[]>(QueryKey.getWorkspaces, {
    fallbackData: [],
    revalidateOnReconnect: true,
    revalidateOnFocus: false,
    revalidateOnMount: true,
    revalidateIfStale: false,
  });
}

async function deleteWorkspace(workspaceId: string) {
  return lockMutex(async () => {
    console.warn('deleting workspace');
    const idx = dataCenter.workspaces.findIndex(
      workspace => workspace.id === workspaceId
    );
    if (idx === -1) {
      throw new Error('workspace not found');
    }
    try {
      const [workspace] = dataCenter.workspaces.splice(idx, 1);
      // @ts-expect-error
      await WorkspacePlugins[workspace.flavour].deleteWorkspace(workspace);
      dataCenter.callbacks.forEach(cb => cb());
    } catch (e) {
      console.error('error deleting workspace', e);
    }
  });
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
      createRemLocalWorkspace,
      deleteWorkspace,
    }),
    []
  );
}
