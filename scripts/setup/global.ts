import { getRuntimeConfig } from '@affine/cli/src/webpack/runtime-config';
import { setupGlobal } from '@affine/env/global';

process.env.RUNTIME_CONFIG = JSON.stringify(
  getRuntimeConfig({
    distribution: 'browser',
    mode: 'development',
    channel: 'canary',
    static: false,
  })
);

if (typeof window !== 'undefined') {
  window.location.search = '?prefixUrl=http://127.0.0.1:3010/';
}

setupGlobal();
