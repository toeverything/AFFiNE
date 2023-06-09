import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { spawnSync } from 'child_process';
import { beforeAll } from 'vitest';

const rootDir = fileURLToPath(new URL('../../', import.meta.url));

beforeAll(async () => {
  console.log('Build plugin infra');
  spawnSync('yarn', ['build'], {
    stdio: 'inherit',
    cwd: resolve(rootDir, './packages/plugin-infra'),
  });

  console.log('Build plugins');
  // @ts-expect-error
  await import('../../apps/electron/scripts/plugins/build-plugins.mjs');
});
