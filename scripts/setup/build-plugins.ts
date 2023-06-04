import { beforeAll } from 'vitest';

beforeAll(async () => {
  console.log('Build plugins');
  await import('../esbuild/build-plugins.mjs');
});
