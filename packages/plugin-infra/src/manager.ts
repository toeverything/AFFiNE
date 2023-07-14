import { assertExists } from '@blocksuite/global/utils';
import type { Page, Workspace } from '@blocksuite/store';
import { atom, createStore } from 'jotai/vanilla';

import { getWorkspace, waitForWorkspace } from './__internal__/workspace';
import type { AffinePlugin, Definition, ServerAdapter } from './type';
import type { Loader, PluginUIAdapter } from './type';
import type { PluginBlockSuiteAdapter } from './type';

const isServer = typeof window === 'undefined';
const isClient = typeof window !== 'undefined';

// global store
export const rootStore = createStore();

// todo: for now every plugin is enabled by default
export const affinePluginsAtom = atom<Record<string, AffinePlugin<string>>>({});
export const currentWorkspaceIdAtom = atom<string | null>(null);
export const currentPageIdAtom = atom<string | null>(null);
export const currentWorkspaceAtom = atom<Promise<Workspace>>(async get => {
  const currentWorkspaceId = get(currentWorkspaceIdAtom);
  assertExists(currentWorkspaceId, 'current workspace id');
  const workspace = getWorkspace(currentWorkspaceId);
  await waitForWorkspace(workspace);
  return workspace;
});
export const currentPageAtom = atom<Promise<Page>>(async get => {
  const currentWorkspaceId = get(currentWorkspaceIdAtom);
  assertExists(currentWorkspaceId, 'current workspace id');
  const currentPageId = get(currentPageIdAtom);
  assertExists(currentPageId, 'current page id');
  const workspace = getWorkspace(currentWorkspaceId);
  await waitForWorkspace(workspace);
  const page = workspace.getPage(currentPageId);
  assertExists(page);
  if (!page.loaded) {
    await page.waitForLoaded();
  }
  return page;
});

export function definePlugin<ID extends string>(
  definition: Definition<ID>,
  uiAdapterLoader?: Loader<Partial<PluginUIAdapter>>,
  blockSuiteAdapter?: Loader<Partial<PluginBlockSuiteAdapter>>,
  serverAdapter?: Loader<ServerAdapter>
) {
  const basePlugin = {
    definition,
    uiAdapter: {},
    blockSuiteAdapter: {},
  };

  rootStore.set(affinePluginsAtom, plugins => ({
    ...plugins,
    [definition.id]: basePlugin,
  }));

  if (isServer) {
    if (serverAdapter) {
      console.log('register server adapter');
      serverAdapter
        .load()
        .then(({ default: adapter }) => {
          rootStore.set(affinePluginsAtom, plugins => ({
            ...plugins,
            [definition.id]: {
              ...basePlugin,
              serverAdapter: adapter,
            },
          }));
        })
        .catch(err => {
          console.error(err);
        });
    }
  } else if (isClient) {
    if (blockSuiteAdapter) {
      const updateAdapter = (adapter: Partial<PluginBlockSuiteAdapter>) => {
        rootStore.set(affinePluginsAtom, plugins => ({
          ...plugins,
          [definition.id]: {
            ...basePlugin,
            blockSuiteAdapter: adapter,
          },
        }));
      };

      blockSuiteAdapter
        .load()
        .then(({ default: adapter }) => updateAdapter(adapter))
        .catch(err => {
          console.error('[definePlugin] blockSuiteAdapter error', err);
        });

      if (import.meta.webpackHot) {
        blockSuiteAdapter.hotModuleReload(async _ => {
          const adapter = (await _).default;
          updateAdapter(adapter);
          console.info('[HMR] Plugin', definition.id, 'hot reloaded.');
        });
      }
    }
    if (uiAdapterLoader) {
      const updateAdapter = (adapter: Partial<PluginUIAdapter>) => {
        rootStore.set(affinePluginsAtom, plugins => ({
          ...plugins,
          [definition.id]: {
            ...basePlugin,
            uiAdapter: adapter,
          },
        }));
      };

      uiAdapterLoader
        .load()
        .then(({ default: adapter }) => updateAdapter(adapter))
        .catch(err => {
          console.error('[definePlugin] blockSuiteAdapter error', err);
        });

      if (import.meta.webpackHot) {
        uiAdapterLoader.hotModuleReload(async _ => {
          const adapter = (await _).default;
          updateAdapter(adapter);
          console.info('[HMR] Plugin', definition.id, 'hot reloaded.');
        });
      }
    }
  }
}
