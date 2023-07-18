import { setupGlobal } from '@affine/env/global';

import { getRuntimeConfig } from '../../apps/core/.webpack/runtime-config';

getRuntimeConfig({
  distribution: 'browser',
  mode: 'development',
  channel: 'canary',
});
setupGlobal();
