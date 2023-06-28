import type {
  PlaywrightTestConfig,
  PlaywrightWorkerOptions,
} from '@playwright/test';

const config: PlaywrightTestConfig = {
  testDir: './tests',
  fullyParallel: true,
  timeout: process.env.CI ? 50_000 : 30_000,
  use: {
    baseURL: 'http://localhost:8081/',
    browserName:
      (process.env.BROWSER as PlaywrightWorkerOptions['browserName']) ??
      'chromium',
    permissions: ['clipboard-read', 'clipboard-write'],
    viewport: { width: 1440, height: 800 },
    actionTimeout: 5 * 1000,
    locale: 'en-US',
    trace: 'on-first-retry',
    video: 'on-first-retry',
  },
  forbidOnly: !!process.env.CI,
  workers: 4,
  retries: 1,
  reporter: process.env.CI ? 'github' : 'list',
  webServer: [
    {
      command: 'yarn start',
      port: 8081,
      timeout: 120 * 1000,
      reuseExistingServer: !process.env.CI,
    },
  ],
};

if (process.env.CI) {
  config.retries = 3;
  config.workers = '50%';
}

export default config;
