import * as esbuild from 'esbuild';

import { config, mode } from './common';

async function buildLayers() {
  const common = config();

  const define: Record<string, string> = {
    'process.env.NODE_ENV': `"${mode}"`,
    'process.env.BUILD_TYPE': `"${process.env.BUILD_TYPE || 'stable'}"`,
  };

  if (process.env.BUILD_TYPE_OVERRIDE) {
    define[
      'process.env.BUILD_TYPE_OVERRIDE'
    ] = `"${process.env.BUILD_TYPE_OVERRIDE}"`;
  }

  await esbuild.build({
    ...common,
    define: define,
  });
}

await buildLayers();
console.log('Build layers done');
