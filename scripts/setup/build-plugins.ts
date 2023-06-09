import { beforeAll } from 'vitest';

beforeAll(async () => {
  console.log('Build plugins');
  // @ts-expect-error
  await import('@affine/electron/scripts/plugins/build-plugins.mjs');
});
