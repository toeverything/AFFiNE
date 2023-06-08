import { beforeAll } from 'vitest';

beforeAll(async () => {
  console.log('Build plugins');
  await import('../../apps/electron/scripts/plugins/build-plugins.mjs');
});
