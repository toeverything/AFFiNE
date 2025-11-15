import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(_configEnv =>
  defineConfig({
    esbuild: { target: 'es2018' },
    optimizeDeps: {
      force: true,
      esbuildOptions: {
        // Vitest hardcodes the esbuild target to es2020,
        // override it to es2022 for top level await.
        target: 'es2022',
      },
    },
    plugins: [vanillaExtractPlugin()],
    test: {
      include: ['src/__tests__/**/*.spec.ts'],
      retry: process.env.CI === 'true' ? 3 : 0,
      browser: {
        enabled: true,
        headless: process.env.CI === 'true',
        instances: [{ browser: 'chromium' }],
        provider: 'playwright',
        isolate: false,
        viewport: {
          width: 1024,
          height: 768,
        },
      },
      coverage: {
        provider: 'istanbul', // or 'c8'
        reporter: ['lcov'],
        reportsDirectory: '../../.coverage/integration-test',
      },
      deps: {
        interopDefault: true,
      },
      testTransformMode: {
        web: ['src/__tests__/**/*.spec.ts'],
      },
    },
  })
);
