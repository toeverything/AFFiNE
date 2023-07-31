import { setupGlobal } from '@affine/env/global';

import { getRuntimeConfig } from '../../apps/core/.webpack/runtime-config';

globalThis.runtimeConfig = getRuntimeConfig({
  distribution: 'browser',
  mode: 'development',
  channel: 'canary',
});

if (typeof window !== 'undefined') {
  window.location.search = '?prefixUrl=http://127.0.0.1:3010/';
}

setupGlobal();
