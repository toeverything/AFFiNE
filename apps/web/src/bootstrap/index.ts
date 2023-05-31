import { config, getEnvironment, setupGlobal } from '@affine/env/config';

if (config.enablePlugin && !getEnvironment().isServer) {
  import('@affine/copilot');
}

setupGlobal();
