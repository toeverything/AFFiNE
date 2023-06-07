import * as esbuild from 'esbuild';
import { beforeAll } from 'vitest';

import { config } from '../common.mjs';

beforeAll(async () => {
  const common = config();
  await esbuild.build(common.preload);

  console.log('Build plugins');
  await import('../plugins/build-plugins.mjs');

  await esbuild.build({
    ...common.main,
    define: {
      ...common.main.define,
      'process.env.NODE_ENV': `"development"`,
      'process.env.BUILD_TYPE': `"canary"`,
    },
  });
});
