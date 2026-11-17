import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// WebKit sibling of `vitest.mobile.config.ts`. The chromium-only mobile
// config spoofs an Android Chrome UA to satisfy `IS_ANDROID` (env/index.ts),
// which is sufficient to flip `IS_MOBILE` true but exercises none of this
// codebase's `IS_SAFARI`/`IS_IOS` branches (`IS_IOS = IS_SAFARI &&
// (/Mobile\/\w+/.test(agent) || maxTouchPoints > 2)`) — and several of this
// project's own mobile bugs (100dvh recompute lag, native accessory-bar
// vs. custom keyboard-toolbar) are explicitly iOS-Safari-only failure
// modes that a Chromium/Android context cannot reproduce even in
// principle, since Chromium is not the engine those bugs live in.
// `IS_SAFARI` itself (`/Apple Computer/.test(navigator.vendor)`) is true
// for Playwright's `webkit` engine automatically — WebKit reports vendor
// "Apple Computer, Inc." regardless of any `userAgent` override — so only
// `userAgent`'s `Mobile/` token (for `IS_IOS`) and `hasTouch` need setting
// here, mirroring Playwright's own `devices['iPhone 13']` descriptor.
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
        instances: [{ browser: 'webkit' }],
        provider: playwright({
          contextOptions: {
            // Mirrors Playwright's own `devices['iPhone 13']` UA (iOS 17
            // Mobile Safari) — the `Mobile/15E148` token is what
            // `IS_IOS`'s `/Mobile\/\w+/` regex requires.
            userAgent:
              'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
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
        // Distinct from the chromium mobile config's own reportsDirectory
        // -- concurrent CI runs of both configs would otherwise silently
        // overwrite one suite's lcov.info with the other's.
        reportsDirectory: '../../.coverage/integration-test-mobile-webkit',
      },
      deps: {
        interopDefault: true,
      },
    },
  })
);
