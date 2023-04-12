#!/usr/bin/env zx
import 'zx/globals';

import path from 'node:path';

import * as esbuild from 'esbuild';

import commonFn from './common.mjs';

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
echo('Clean up done');

// step 1: build web (nextjs) dist
cd(repoRootDir);
await $`yarn add`;
await $`yarn build`;
await $`yarn export`;
await fs.move(affineWebOutDir, publicAffineOutDir, { overwrite: true });

// step 2: build electron resources
await buildLayers();
echo('Build layers done');

// step 3: build octobase-node
let buildOctobaseNode = 'yarn workspace @affine/octobase-node build';
if (process.env.TARGET) {
  buildOctobaseNode += ` --target=${process.env.TARGET}`;
}
await $([buildOctobaseNode]);

// step 4: copy octobase-node to electron dist
await fs.ensureDir('./apps/electron/dist/layers/main/');
await $`cp ./packages/octobase-node/octobase.*.node ./apps/electron/dist/layers/main/`;

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
  const common = commonFn();
  await esbuild.build(common.preload);

  await esbuild.build({
    ...common.main,
    define: {
      ...common.main.define,
      'process.env.NODE_ENV': `"production"`,
    },
  });
}
