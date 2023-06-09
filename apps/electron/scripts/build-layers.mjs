#!/usr/bin/env zx
import 'zx/globals';

import { resolve } from 'node:path';

import { spawnSync } from 'child_process';
import * as esbuild from 'esbuild';

import { config, rootDir } from './common.mjs';

const NODE_ENV =
  process.env.NODE_ENV === 'development' ? 'development' : 'production';

if (process.platform === 'win32') {
  $.shell = true;
  $.prefix = '';
}

async function buildLayers() {
  const common = config();
  await esbuild.build(common.preload);
  console.log('Build plugin infra');
  spawnSync('yarn', ['build'], {
    stdio: 'inherit',
    cwd: resolve(rootDir, './packages/plugin-infra'),
  });

  console.log('Build plugins');
  await import('./plugins/build-plugins.mjs');

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
