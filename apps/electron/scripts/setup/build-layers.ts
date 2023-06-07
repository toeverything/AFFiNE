import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';
import { beforeAll } from 'vitest';

import { config } from '../common.mjs';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const pluginOutputDir = resolve(rootDir, './dist/plugins');

beforeAll(async () => {
  const common = config();
  await esbuild.build(common.preload);

  console.log('Build plugins');
  await import('../plugins/build-plugins.mjs');

  await esbuild.build({
    ...common.main,
    define: {
      ...common.main.define,
      'process.env.PLUGIN_DIR': JSON.stringify(pluginOutputDir),
      'process.env.NODE_ENV': `"development"`,
      'process.env.BUILD_TYPE': `"canary"`,
    },
  });
});
