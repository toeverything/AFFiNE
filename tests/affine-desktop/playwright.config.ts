import assert from 'node:assert';

import { testResultDir } from '@affine-test/kit/playwright';
import type { PlaywrightTestConfig } from '@playwright/test';
// import { devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config: PlaywrightTestConfig = {
  testDir: './e2e',
  fullyParallel: true,
  timeout: process.env.CI ? 50_000 : 30_000,
  expect: {
    timeout: process.env.CI ? 15_000 : 5_000,
  },
  outputDir: testResultDir,
  use: {
    viewport: { width: 1440, height: 800 },
    trace: 'retain-on-failure',
  },
};

if (process.env.CI) {
  config.retries = 5;
  config.workers = 1;
}

if (process.env.DEV_SERVER_URL) {
  const devServerUrl = new URL(process.env.DEV_SERVER_URL);
  assert(
    devServerUrl.origin === 'http://localhost:8080',
    'DEV_SERVER_URL must be http://localhost:8080'
  );
  config.webServer = [
    {
      command: 'yarn run -T affine bundle -p @affine/electron-renderer --dev',
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        COVERAGE: process.env.COVERAGE || 'false',
      },
      url: 'http://localhost:8080',
    },
  ];
}

export default config;
