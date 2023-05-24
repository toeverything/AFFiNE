import type { AffinePlugin, Definition } from './type';
import type { PluginAdapterCreator } from './type';
import type { AffinePluginContext } from './type';

export const plugins = new Map<string, AffinePlugin<string>>();

function createPluginContext(): AffinePluginContext {
  return {
    toast: _text => {
      // todo
    },
  };
}

export function definePlugin<ID extends string>(
  definition: Definition<ID>,
  adapter?: PluginAdapterCreator
) {
  const context = createPluginContext();

  plugins.set(definition.id, {
    definition,
    adapter: adapter ? adapter(context) : {},
  });
}
