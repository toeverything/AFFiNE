import { testResultDir } from '@affine-test/kit/playwright';
import { devices, type PlaywrightTestConfig } from '@playwright/test';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
  testDir: './e2e',
  fullyParallel: true,
  timeout: process.env.CI ? 60_000 : 30_000,
  outputDir: testResultDir,
  projects: [
    {
      name: 'setup',
      testMatch: /e2e\/setup\.ts/,
    },
    {
      name: 'Mobile Safari',
      use: {
        ...devices['iPhone 14'],
      },
      dependencies: ['setup'],
    },
    {
      name: 'Mobile Chrome',
      use: {
        ...devices['Pixel 5'],
      },
      dependencies: ['setup'],
    },
  ],
  expect: {
    timeout: process.env.CI ? 15_000 : 5_000,
  },
  use: {
    baseURL: 'http://localhost:8080/',
    locale: 'en-US',
    // Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer
    // You can open traces locally(`npx playwright show-trace trace.zip`)
    // or in your browser on [Playwright Trace Viewer](https://trace.playwright.dev/).
    trace: 'on-first-retry',
    // Record video only when retrying a test for the first time.
    video: 'on-first-retry',
  },
  forbidOnly: !!process.env.CI,
  workers: 4,
  retries: 1,
  // 'github' for GitHub Actions CI to generate annotations, plus a concise 'dot'
  // default 'list' when running locally
  // See https://playwright.dev/docs/test-reporters#github-actions-annotations
  reporter: process.env.CI ? 'github' : 'list',

  webServer: [
    {
      command: 'yarn run serve:test-static',
      port: 8081,
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        COVERAGE: process.env.COVERAGE || 'false',
        ENABLE_DEBUG_PAGE: '1',
      },
    },
    // Intentionally not building the web, reminds you to run it by yourself.
    {
      command: 'yarn workspace @affine/mobile static-server',
      port: 8080,
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        COVERAGE: process.env.COVERAGE || 'false',
      },
    },
  ],
};

if (process.env.CI) {
  config.retries = 3;
  config.workers = '50%';
}

export default config;
