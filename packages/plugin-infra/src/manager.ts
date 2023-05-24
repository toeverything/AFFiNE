import type { AffinePlugin, Definition } from './type';
import type { AffinePluginContext } from './type';
import type { Loader, PluginUIAdapter } from './type';

// todo: for now every plugin is enabled by default
export const affinePlugins = new Map<string, AffinePlugin<string>>();

function createPluginContext(): AffinePluginContext {
  return {
    toast: _text => {
      // todo
    },
  };
}

export function definePlugin<ID extends string>(
  definition: Definition<ID>,
  _uiAdapterLoader?: Loader<Partial<PluginUIAdapter>>
) {
  const _context = createPluginContext();
  affinePlugins.set(definition.id, {
    definition,
    // todo: finish this
    uiAdapter: null!,
  });
}
