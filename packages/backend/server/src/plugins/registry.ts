import { omit } from 'lodash-es';

import { AvailablePlugins } from '../fundamentals/config';
import { OptionalModule, OptionalModuleMetadata } from '../fundamentals/nestjs';

export const REGISTERED_PLUGINS = new Map<AvailablePlugins, AFFiNEModule>();

function register(plugin: AvailablePlugins, module: AFFiNEModule) {
  REGISTERED_PLUGINS.set(plugin, module);
}

interface PluginModuleMetadata extends OptionalModuleMetadata {
  name: AvailablePlugins;
}

export const Plugin = (options: PluginModuleMetadata) => {
  return (target: any) => {
    register(options.name, target);

    return OptionalModule(omit(options, 'name'))(target);
  };
};
