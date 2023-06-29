import { set } from 'lodash-es';

import { type AFFiNEConfig, parseEnvValue } from './def';

export function applyEnvToConfig(rawConfig: AFFiNEConfig) {
  for (const env in rawConfig.ENV_MAP) {
    const config = rawConfig.ENV_MAP[env];
    const [path, value] =
      typeof config === 'string'
        ? [config, process.env[env]]
        : [config[0], parseEnvValue(process.env[env], config[1])];

    if (typeof value !== 'undefined') {
      set(rawConfig, path, value);
    }
  }
}
