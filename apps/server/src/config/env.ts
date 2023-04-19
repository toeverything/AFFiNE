import { set } from 'lodash-es';

import { parseEnvValue } from './def';

for (const env in AFFiNE.ENV_MAP) {
  const config = AFFiNE.ENV_MAP[env];
  const [path, value] =
    typeof config === 'string'
      ? [config, process.env[env]]
      : [config[0], parseEnvValue(process.env[env], config[1])];

  if (typeof value !== 'undefined') {
    set(globalThis.AFFiNE, path, process.env[env]);
  }
}
