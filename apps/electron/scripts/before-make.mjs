#!/usr/bin/env zx
import 'zx/globals';

import path from 'node:path';

import * as esbuild from 'esbuild';

import { mainConfig, preloadConfig } from './common.mjs';

const repoRootDir = path.join(__dirname, '..', '..', '..');
const electronRootDir = path.join(__dirname, '..');
const publicDistDir = path.join(electronRootDir, 'resources');
const affineWebDir = path.join(repoRootDir, 'apps', 'web');
const affineWebOutDir = path.join(affineWebDir, 'out');
const publicAffineOutDir = path.join(publicDistDir, `web-static`);

console.log('build with following dir', {
  repoRootDir,
  electronRootDir,
  publicDistDir,
  affineSrcDir: affineWebDir,
  affineSrcOutDir: affineWebOutDir,
  publicAffineOutDir,
});

// copy web dist files to electron dist

// step 0: clean up
await cleanup();
console.log('Clean up done');

// step 1: build web (nextjs) dist
cd(repoRootDir);
await $`pnpm i -r`;
await $`pnpm build`;
await $`pnpm export`;
await fs.move(affineWebOutDir, publicAffineOutDir, { overwrite: true });

// step 2: build electron resources
await buildLayers();
console.log('Build layers done');

/// --------
/// --------
/// --------
async function cleanup() {
  await fs.emptyDir(publicAffineOutDir);
  await fs.emptyDir(path.join(electronRootDir, 'layers', 'main', 'dist'));
  await fs.emptyDir(path.join(electronRootDir, 'layers', 'preload', 'dist'));
  await fs.remove(path.join(electronRootDir, 'out'));
}

async function buildLayers() {
  await esbuild.build({
    ...preloadConfig,
  });

  await esbuild.build({
    ...mainConfig,
    define: {
      'process.env.NODE_ENV': `"production"`,
    },
  });
}
