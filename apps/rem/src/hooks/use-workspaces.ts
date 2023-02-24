import { assertEquals, uuidv4 } from '@blocksuite/store';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { IndexeddbPersistence } from 'y-indexeddb';

import { createLocalProviders } from '../blocksuite';
import { UIPlugins } from '../plugins';
import { LocalWorkspace, RemWorkspace, RemWorkspaceFlavour } from '../shared';
import { config } from '../shared/env';
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
function createRemLocalWorkspace(name: string) {
  const id = uuidv4();
  const blockSuiteWorkspace = createEmptyBlockSuiteWorkspace(id);
  blockSuiteWorkspace.meta.setName(name);
  const workspace: LocalWorkspace = {
    flavour: RemWorkspaceFlavour.LOCAL,
    blockSuiteWorkspace: blockSuiteWorkspace,
    providers: [...createLocalProviders(blockSuiteWorkspace)],
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
}

declare global {
  // eslint-disable-next-line no-var
  var dataCenter: unknown;
}

const kWorkspaces = 'affine-workspaces';

if (typeof window !== 'undefined') {
  const localData = JSON.parse(localStorage.getItem(kWorkspaces) ?? '[]');
  if (!localData || !Array.isArray(localData) || localData.length === 0) {
    console.info('no local data, creating a default workspace');
    const workspaceId = createRemLocalWorkspace('Test Workspace');
    const workspace = dataCenter.workspaces.find(
      ws => ws.id === workspaceId
    ) as LocalWorkspace;
    assertEquals(workspace.flavour, RemWorkspaceFlavour.LOCAL);
    assertEquals(workspace.id, workspaceId);
    workspace.blockSuiteWorkspace.createPage(uuidv4());
  }
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
  if (!config.prefetchAffineRemoteWorkspace) {
    console.info('prefetchNecessaryData: skip prefetching');
    return;
  }
  Object.entries(UIPlugins).map(([pluginName, plugin]) => {
    console.info('prefetchNecessaryData: plugin', pluginName);
    return plugin.prefetchData(dataCenter).catch(e => {
      console.error('error prefetch data', pluginName, e);
    });
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
      createRemLocalWorkspace,
    }),
    []
  );
}
