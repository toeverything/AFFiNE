import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Mobile-context-only sibling to `vitest.config.ts` — deliberately not
// imported from / mutating that file (MOBILE-05 requires the existing
// desktop suite provably untouched). `esbuild`/`optimizeDeps`/`plugins`
// mirror the base config verbatim; only `test.include` and `test.browser`
// differ, since this project's whole purpose is running the same suite
// mechanics under a real Playwright mobile-device-emulation context
// (`hasTouch`/`isMobile`/mobile `userAgent`, set at `browser.newContext()`
// creation time via `provider: playwright({ contextOptions: {...} })` —
// `IS_MOBILE` (`@blocksuite/global/env`) is a plain top-level `const` read
// once at module load, so the context must already be mobile-flavored
// *before* any page navigates, not patched in afterward via
// `page.evaluate()`).
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
      include: ['src/__tests__/mobile/**/*.spec.ts'],
      fileParallelism: false,
      retry: process.env.CI === 'true' ? 3 : 0,
      browser: {
        enabled: true,
        headless: true,
        instances: [{ browser: 'chromium' }],
        provider: playwright({
          contextOptions: {
            // Android 13 / Chrome UA — matches env/index.ts's `/Android \d/`
            // regex reliably, without depending on the more complex
            // IS_SAFARI + Mobile/ branch used for iOS detection.
            userAgent:
              'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
            hasTouch: true,
            isMobile: true,
            viewport: { width: 390, height: 844 },
          },
        }),
        isolate: false,
        viewport: {
          width: 390,
          height: 844,
        },
      },
      coverage: {
        provider: 'istanbul',
        reporter: ['lcov'],
        // Distinct from vitest.config.ts's own '../../.coverage/integration-test'
        // -- a shared directory would have one suite's lcov.info silently
        // overwrite the other's if both run in the same CI job.
        reportsDirectory: '../../.coverage/integration-test-mobile',
      },
      deps: {
        interopDefault: true,
      },
    },
  })
);
