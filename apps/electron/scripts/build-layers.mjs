#!/usr/bin/env zx
import 'zx/globals';

import * as esbuild from 'esbuild';

import { config } from './common.mjs';

const NODE_ENV =
  process.env.NODE_ENV === 'development' ? 'development' : 'production';

if (process.platform === 'win32') {
  $.shell = true;
  $.prefix = '';
}

async function buildLayers() {
  const common = config();
  await esbuild.build(common.preload);

  await esbuild.build({
    ...common.main,
    define: {
      ...common.main.define,
      'process.env.NODE_ENV': `"${NODE_ENV}"`,
      'process.env.BUILD_TYPE': `"${process.env.BUILD_TYPE || 'stable'}"`,
    },
  });
}

await buildLayers();
echo('Build layers done');
