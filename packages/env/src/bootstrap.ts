import { config, getEnvironment } from './config';

if (config.enablePlugin && !getEnvironment().isServer) {
  import('@affine/copilot');
}
