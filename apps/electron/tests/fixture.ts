/* eslint-disable no-empty-pattern */
import { resolve } from 'node:path';

import { test as base } from '@affine-test/kit/playwright';
import type { App } from 'electron';
import fs from 'fs-extra';
import type { ElectronApplication, Page } from 'playwright';
import { _electron as electron } from 'playwright';

let electronApp: ElectronApplication;
let page: Page;

let appInfo: {
  appPath: string;
  appData: string;
  sessionData: string;
};

export const test = base.extend<{
  page: Page;
  electronApp: ElectronApplication;
}>({
  page: async ({}, use) => {
    await use(page);
  },
  electronApp: async ({}, use) => {
    await use(electronApp);
  },
});

test.beforeEach(async () => {
  // a random id to avoid conflicts between tests
  const id = Math.random().toString(36).substring(2, 9);
  electronApp = await electron.launch({
    args: [resolve(__dirname, '..'), '--app-name', 'affine-test-' + id],
    executablePath: resolve(__dirname, '../node_modules/.bin/electron'),
    colorScheme: 'light',
  });

  appInfo = await electronApp.evaluate(async ({ app }: { app: App }) => {
    return {
      appPath: app.getAppPath(),
      appData: app.getPath('appData'),
      sessionData: app.getPath('sessionData'),
    };
  });

  page = await electronApp.firstWindow();
  await page.getByTestId('onboarding-modal-close-button').click({
    delay: 100,
  });
});

test.afterEach(async () => {
  await page.close();
  await electronApp.close();
  // cleanup session data
  await fs.rm(appInfo.sessionData, { recursive: true });
});
