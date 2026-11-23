import type { ServiceIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

import { ConfigIdentifier } from '../identifier.js';

export interface ConfigFactory<Config extends Record<string, any>> {
  (config: Config): ExtensionType;
  identifier: ServiceIdentifier<Config>;
}

/**
 * Create a config extension.
 * A config extension provides a configuration object for a block flavour.
 * The configuration object can be used like:
 * ```ts
 * const config = std.provider.getOptional(ConfigIdentifier('my-flavour'));
 * ```
 *
 * @param configId The id of the config. Should be unique for each config.
 *
 * @example
 * ```ts
 * import { ConfigExtensionFactory } from '@blocksuite/std';
 * const MyConfigExtensionFactory = ConfigExtensionFactory<ConfigType>('my-flavour');
 * const MyConfigExtension = MyConfigExtensionFactory({
 *   option1: 'value1',
 *   option2: 'value2',
 * });
 * ```
 */
export function ConfigExtensionFactory<Config extends Record<string, any>>(
  configId: string
): ConfigFactory<Config> {
  const identifier = ConfigIdentifier(configId) as ServiceIdentifier<Config>;
  const extensionFactory = (config: Config): ExtensionType => ({
    setup: di => {
      di.override(ConfigIdentifier(configId), () => {
        return config;
      });
    },
  });
  extensionFactory.identifier = identifier;
  return extensionFactory;
}
