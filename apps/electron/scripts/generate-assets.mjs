#!/usr/bin/env zx
import 'zx/globals';

import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

const repoRootDir = path.join(__dirname, '..', '..', '..');
const electronRootDir = path.join(__dirname, '..');
const publicDistDir = path.join(electronRootDir, 'resources');
const affineWebDir = path.join(repoRootDir, 'apps', 'web');
const affineWebOutDir = path.join(affineWebDir, 'out');
const publicAffineOutDir = path.join(publicDistDir, `web-static`);
const releaseVersionEnv = process.env.RELEASE_VERSION || '';

console.log('build with following dir', {
  repoRootDir,
  electronRootDir,
  publicDistDir,
  affineSrcDir: affineWebDir,
  affineSrcOutDir: affineWebOutDir,
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

// step 1: clean up
await cleanup();
echo('Clean up done');

if (process.platform === 'win32') {
  $.shell = 'powershell.exe';
  $.prefix = '';
}

cd(repoRootDir);

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

// step 3: update app-updater.yml content with build type in resources folder
if (process.env.BUILD_TYPE === 'internal') {
  const appUpdaterYml = path.join(publicDistDir, 'app-update.yml');
  const appUpdaterYmlContent = await fs.readFile(appUpdaterYml, 'utf-8');
  const newAppUpdaterYmlContent = appUpdaterYmlContent.replace(
    'AFFiNE',
    'AFFiNE-Releases'
  );
  await fs.writeFile(appUpdaterYml, newAppUpdaterYmlContent);
}

/// --------
/// --------
/// --------
async function cleanup() {
  if (!process.env.SKIP_WEB_BUILD) {
    await fs.emptyDir(publicAffineOutDir);
  }
  await fs.remove(path.join(electronRootDir, 'dist'));
  await fs.remove(path.join(electronRootDir, 'out'));
}
