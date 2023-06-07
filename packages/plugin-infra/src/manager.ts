import { DebugLogger } from '@affine/debug';
import { rootStore } from '@affine/workspace/atom';
import { atom } from 'jotai';

import type { AffinePlugin, Definition } from './type';
import type { Loader, PluginUIAdapter } from './type';
import type { PluginBlockSuiteAdapter } from './type';

// todo: for now every plugin is enabled by default
export const affinePluginsAtom = atom<Record<string, AffinePlugin<string>>>({});

const pluginLogger = new DebugLogger('affine:plugin');

export function definePlugin<ID extends string>(
  definition: Definition<ID>,
  uiAdapterLoader?: Loader<Partial<PluginUIAdapter>>,
  blockSuiteAdapter?: Loader<Partial<PluginBlockSuiteAdapter>>
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
        pluginLogger.error('[definePlugin] blockSuiteAdapter error', err);
      });

    if (import.meta.webpackHot) {
      blockSuiteAdapter.hotModuleReload(async _ => {
        const adapter = (await _).default;
        updateAdapter(adapter);
        pluginLogger.info('[HMR] Plugin', definition.id, 'hot reloaded.');
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
        pluginLogger.error('[definePlugin] blockSuiteAdapter error', err);
      });

    if (import.meta.webpackHot) {
      uiAdapterLoader.hotModuleReload(async _ => {
        const adapter = (await _).default;
        updateAdapter(adapter);
        pluginLogger.info('[HMR] Plugin', definition.id, 'hot reloaded.');
      });
    }
  }
}
