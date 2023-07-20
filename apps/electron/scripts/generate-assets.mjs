#!/usr/bin/env zx
import 'zx/globals';

import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const repoRootDir = path.join(__dirname, '..', '..', '..');
const electronRootDir = path.join(__dirname, '..');
const publicDistDir = path.join(electronRootDir, 'resources');
const affineCoreDir = path.join(repoRootDir, 'apps', 'core');
const affineCoreOutDir = path.join(affineCoreDir, 'dist');
const publicAffineOutDir = path.join(publicDistDir, `web-static`);
const releaseVersionEnv = process.env.RELEASE_VERSION || '';

console.log('build with following dir', {
  repoRootDir,
  electronRootDir,
  publicDistDir,
  affineSrcDir: affineCoreDir,
  affineSrcOutDir: affineCoreOutDir,
  publicAffineOutDir,
});

// step 0: check version match
const electronPackageJson = require(`${electronRootDir}/package.json`);
if (releaseVersionEnv && electronPackageJson.version !== releaseVersionEnv) {
  throw new Error(
    `Version mismatch, expected ${releaseVersionEnv} but got ${electronPackageJson.version}`
  );
}
// copy web dist files to electron dist

if (process.platform === 'win32') {
  $.shell = 'powershell.exe';
  $.prefix = '';
}

cd(repoRootDir);

// step 1: build web (nextjs) dist
if (!process.env.SKIP_WEB_BUILD) {
  await $`DISTRIBUTION=desktop yarn nx build @affine/core`;
  await fs.move(affineCoreOutDir, publicAffineOutDir, { overwrite: true });
}

// step 2: update app-updater.yml content with build type in resources folder
if (process.env.BUILD_TYPE === 'internal') {
  const appUpdaterYml = path.join(publicDistDir, 'app-update.yml');
  const appUpdaterYmlContent = await fs.readFile(appUpdaterYml, 'utf-8');
  const newAppUpdaterYmlContent = appUpdaterYmlContent.replace(
    'AFFiNE',
    'AFFiNE-Releases'
  );
  await fs.writeFile(appUpdaterYml, newAppUpdaterYmlContent);
}
