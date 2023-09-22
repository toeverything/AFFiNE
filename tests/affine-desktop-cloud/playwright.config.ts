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
  use: {
    viewport: { width: 1440, height: 800 },
  },
  reporter: process.env.CI ? 'github' : 'list',
  webServer: [
    // Intentionally not building the web, reminds you to run it by yourself.
    {
      command: 'yarn -T run start:web-static',
      port: 8080,
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      env: {
        COVERAGE: process.env.COVERAGE || 'false',
      },
    },
    {
      command: 'yarn workspace @affine/server start',
      port: 3010,
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://affine:affine@localhost:5432/affine',
        NODE_ENV: 'development',
        AFFINE_ENV: process.env.AFFINE_ENV ?? 'dev',
        DEBUG: 'affine:*',
        FORCE_COLOR: 'true',
        DEBUG_COLORS: 'true',
        ENABLE_LOCAL_EMAIL: process.env.ENABLE_LOCAL_EMAIL ?? 'true',
        NEXTAUTH_URL: 'http://localhost:8080',
        OAUTH_EMAIL_SENDER: 'noreply@toeverything.info',
      },
    },
  ],
};

if (process.env.CI) {
  config.retries = 3;
  config.workers = '50%';
}

export default config;
