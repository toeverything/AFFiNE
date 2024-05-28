import { get, merge, omit, set } from 'lodash-es';

import { OptionalModule, OptionalModuleMetadata } from '../fundamentals/nestjs';
import { AvailablePlugins } from './config';

export const REGISTERED_PLUGINS = new Map<AvailablePlugins, AFFiNEModule>();
export const ENABLED_PLUGINS = new Set<AvailablePlugins>();

function registerPlugin(plugin: AvailablePlugins, module: AFFiNEModule) {
  REGISTERED_PLUGINS.set(plugin, module);
}

interface PluginModuleMetadata extends OptionalModuleMetadata {
  name: AvailablePlugins;
}

export const Plugin = (options: PluginModuleMetadata) => {
  return (target: any) => {
    registerPlugin(options.name, target);

    return OptionalModule(omit(options, 'name'))(target);
  };
};

export function enablePlugin(plugin: AvailablePlugins, config: any = {}) {
  config = merge(get(AFFiNE.plugins, plugin), config);
  set(AFFiNE.plugins, plugin, config);

  ENABLED_PLUGINS.add(plugin);
}
