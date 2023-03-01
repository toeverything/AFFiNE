import getConfig from 'next/config';

import { PublicRuntimeConfig, publicRuntimeConfigSchema } from '../types';

const { publicRuntimeConfig: config } = getConfig() as {
  publicRuntimeConfig: PublicRuntimeConfig;
};

publicRuntimeConfigSchema.parse(config);

export { config };
