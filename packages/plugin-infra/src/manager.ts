import { DebugLogger } from '@affine/debug';
import { rootStore } from '@affine/workspace/atom';
import { atom } from 'jotai';

import type { AffinePlugin, Definition } from './type';
import type { Loader, PluginUIAdapter } from './type';

// todo: for now every plugin is enabled by default
export const affinePluginsAtom = atom<Record<string, AffinePlugin<string>>>({});

const pluginLogger = new DebugLogger('affine:plugin');
import { config } from '@affine/env';
export function definePlugin<ID extends string>(
  definition: Definition<ID>,
  uiAdapterLoader?: Loader<Partial<PluginUIAdapter>>
) {
  if (!config.enablePlugin) {
    return;
  }
  const basePlugin = {
    definition,
    uiAdapter: {},
  };
  rootStore.set(affinePluginsAtom, plugins => ({
    ...plugins,
    [definition.id]: basePlugin,
  }));
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
      .then(({ default: adapter }) => updateAdapter(adapter));
    if (import.meta.webpackHot) {
      uiAdapterLoader.hotModuleReload(async _ => {
        const adapter = (await _).default;
        updateAdapter(adapter);
        pluginLogger.info('[HMR] Plugin', definition.id, 'hot reloaded.');
      });
    }
  }
}
