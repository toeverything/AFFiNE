import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';
import { beforeAll } from 'vitest';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));

beforeAll(async () => {
  console.log('Build plugin infra');
  await build({
    configFile: resolve(rootDir, './packages/plugin-infra/vite.config.ts'),
  });
  console.log('Build plugins');
  await import('../../apps/electron/scripts/plugins/build-plugins.mjs');
});
