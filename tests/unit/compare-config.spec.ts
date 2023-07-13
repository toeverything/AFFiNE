import { expect, test } from 'vitest';

test('compare config', async () => {
  const { default: nextConfigMock } = await import(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    '../../scripts/vitest/next-config-mock'
  );
  const mockConfig = nextConfigMock().publicRuntimeConfig;
  const { default: nextConfig } = await import(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    '../../apps/web/next.config.mjs'
  );
  const config = nextConfig.publicRuntimeConfig;

  Object.keys(config).forEach(key => {
    expect(key in mockConfig, `${key} should be in the mockConfig`).toBe(true);
    expect(typeof config[key], `${key}`).toBe(typeof mockConfig[key]);
  });
  Object.keys(mockConfig).forEach(key => {
    expect(key in config, `${key} should be in the config`).toBe(true);
    expect(typeof config[key], `${key}`).toBe(typeof mockConfig[key]);
  });
});
