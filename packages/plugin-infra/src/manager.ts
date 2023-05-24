import { DebugLogger } from '@affine/debug';
import { rootStore } from '@affine/workspace/atom';
import { atom } from 'jotai';

import type { AffinePlugin, Definition } from './type';
import type { AffinePluginContext } from './type';
import type { Loader, PluginUIAdapter } from './type';

// todo: for now every plugin is enabled by default
export const affinePluginsAtom = atom<Record<string, AffinePlugin<string>>>({});
export const affineRightItemsAtom = atom<HTMLElement[]>([]);

const pluginLogger = new DebugLogger('affine:plugin');

function createPluginContext(): AffinePluginContext {
  return {
    toast: _text => {
      // todo
    },
  };
}

export function definePlugin<ID extends string>(
  definition: Definition<ID>,
  uiAdapterLoader?: Loader<Partial<PluginUIAdapter>>
) {
  const _context = createPluginContext();
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

// rootStore.sub(affinePluginsAtom, () => {
//   const plugins = Object.values(rootStore.get(affinePluginsAtom))
//   const items = plugins.filter(plugin => plugin.uiAdapter.headerItem != null).map(plugin => {
//     const headerItem = plugin.uiAdapter
//       .headerItem as PluginUIAdapter['headerItem'];
//     return headerItem()
//   });
//   rootStore.set(affineRightItemsAtom, [])
// })
