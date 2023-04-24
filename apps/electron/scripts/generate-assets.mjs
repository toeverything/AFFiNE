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

if (process.platform === 'win32') {
  $.shell = 'powershell.exe';
  $.prefix = '';
}

cd(repoRootDir);

// step 1: build electron resources
await buildLayers();
echo('Build layers done');

// step 2: build web (nextjs) dist
if (!process.env.SKIP_WEB_BUILD) {
  process.env.ENABLE_LEGACY_PROVIDER = 'false';
  await $`yarn build`;
  await $`yarn export`;

  // step 1.5: amend sourceMappingURL to allow debugging in devtools
  await glob('**/*.{js,css}', { cwd: affineWebOutDir }).then(files => {
    return files.map(async file => {
      const dir = path.dirname(file);
      const fullpath = path.join(affineWebOutDir, file);
      let content = await fs.readFile(fullpath, 'utf-8');
      // replace # sourceMappingURL=76-6370cd185962bc89.js.map
      // to      # sourceMappingURL=assets://./{dir}/76-6370cd185962bc89.js.map
      content = content.replace(/# sourceMappingURL=(.*)\.map/g, (_, p1) => {
        return `# sourceMappingURL=assets://./${dir}/${p1}.map`;
      });
      await fs.writeFile(fullpath, content);
    });
  });

  await fs.move(affineWebOutDir, publicAffineOutDir, { overwrite: true });
}

/// --------
/// --------
/// --------
async function cleanup() {
  if (!process.env.SKIP_WEB_BUILD) {
    await fs.emptyDir(publicAffineOutDir);
  }
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
