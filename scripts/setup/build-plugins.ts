import { beforeAll } from 'vitest';

beforeAll(async () => {
  console.log('Build plugins');
  // @ts-expect-error
  await import('../../apps/electron/scripts/plugins/build-plugins.mjs');
});
