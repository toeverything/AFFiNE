import { resolve } from 'node:path';

import { fileURLToPath } from 'url';
import { build } from 'vite';
import { beforeAll } from 'vitest';

export const rootDir = fileURLToPath(new URL('../..', import.meta.url));

beforeAll(async () => {
  const { default: config } = await import(
    resolve(rootDir, './plugins/bookmark-block/vite.config.ts')
  );
  await build(config);
});
