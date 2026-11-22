import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

export default {
  esbuild: {
    target: 'es2022',
  },
  plugins: [vanillaExtractPlugin()],
  test: {
    include: [
      'apps/_common/sync/room/__tests__/**/*.spec.ts',
      '../native-playground/tokens/surface-oracle.spec.mjs',
    ],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    restoreMocks: true,
  },
};
