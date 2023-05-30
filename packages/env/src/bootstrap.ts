import { config, getEnvironment, setupGlobal } from './config';

if (config.enablePlugin && !getEnvironment().isServer) {
  import('@affine/copilot');
}

setupGlobal();
