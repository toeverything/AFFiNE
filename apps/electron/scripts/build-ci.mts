#!/usr/bin/env ts-node-esm
import * as esbuild from 'esbuild';

import { config } from './common.mjs';

const common = config();
await esbuild.build(common.preload);

await esbuild.build({
  ...common.main,
  define: {
    ...common.main.define,
    'process.env.NODE_ENV': `"production"`,
  },
});

console.log('Compiled successfully.');
