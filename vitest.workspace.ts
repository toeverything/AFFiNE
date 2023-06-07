export default [
  process.env.NATIVE_TEST ? undefined : './vitest.config.ts',
  // split tests that include native addons or not
  process.env.NATIVE_TEST ? './apps/electron/vitest.config.ts' : undefined,
].filter(Boolean);
