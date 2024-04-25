import fs from 'node:fs/promises';
import path from 'node:path';

import * as esbuild from 'esbuild';

import { config, mode, rootDir } from './common';

async function buildLayers() {
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
