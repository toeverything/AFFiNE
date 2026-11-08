import fs from 'node:fs/promises';
import path from 'node:path';

import * as esbuild from 'esbuild';

import { config, electronDir, mode, rootDir } from './common';

async function assertNoRuntimeWorkspaceDependencies() {
  const packageJson = JSON.parse(
    await fs.readFile(path.resolve(electronDir, 'package.json'), 'utf8')
  ) as { dependencies?: Record<string, string> };
  const workspaceDependencies = Object.entries(
    packageJson.dependencies ?? {}
  ).filter(([, version]) => version.startsWith('workspace:'));

  if (workspaceDependencies.length) {
    throw new Error(
      `Electron workspace dependencies must be bundled and declared as devDependencies: ${workspaceDependencies
        .map(([name]) => name)
        .join(', ')}`
    );
  }
}

async function buildLayers() {
  await assertNoRuntimeWorkspaceDependencies();
  const common = config();

  const define: Record<string, string> = {
    ...common.define,
    'process.env.NODE_ENV': `"${mode}"`,
    'process.env.BUILD_TYPE': `"${process.env.BUILD_TYPE || 'stable'}"`,
  };

  if (process.env.BUILD_TYPE_OVERRIDE) {
    define['process.env.BUILD_TYPE_OVERRIDE'] =
      `"${process.env.BUILD_TYPE_OVERRIDE}"`;
  }

  const metafile = process.env.METAFILE;

  const result = await esbuild.build({
    ...common,
    define: define,
    metafile: !!metafile,
  });

  if (metafile) {
    await fs.writeFile(
      path.resolve(rootDir, `metafile-${Date.now()}.json`),
      JSON.stringify(result.metafile, null, 2)
    );
  }
}

await buildLayers();
console.log('Build layers done');
