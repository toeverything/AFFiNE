import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

import { fileURLToPath } from 'url';
import { beforeAll } from 'vitest';

export const rootDir = fileURLToPath(new URL('../..', import.meta.url));

beforeAll(async () => {
  spawnSync('yarn', ['build'], {
    cwd: resolve(rootDir, './plugins/bookmark-block'),
    stdio: 'inherit',
  });
});
