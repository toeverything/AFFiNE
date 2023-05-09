// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../layers/preload/preload.d.ts" />

/* eslint-disable no-empty-pattern */
import crypto from 'node:crypto';
import { resolve } from 'node:path';

import { test as base } from '@affine-test/kit/playwright';
import fs from 'fs-extra';
import type { ElectronApplication, Page } from 'playwright';
import { _electron as electron } from 'playwright';

function generateUUID() {
  return crypto.randomUUID();
}

export const test = base.extend<{
  page: Page;
  electronApp: ElectronApplication;
  appInfo: {
    appPath: string;
    appData: string;
    sessionData: string;
  };
  workspace: {
    // get current workspace
    current: () => Promise<any>; // todo: type
  };
}>({
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.getByTestId('onboarding-modal-close-button').click({
      delay: 100,
    });
    if (!process.env.CI) {
      await electronApp.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0].webContents.openDevTools({
          mode: 'detach',
        });
      });
    }
    const logFilePath = await page.evaluate(async () => {
      return window.apis?.debug.logFilePath();
    });
    await use(page);
    await page.close();
    if (logFilePath) {
      const logs = await fs.readFile(logFilePath, 'utf-8');
      console.log(logs);
    }
  },
  electronApp: async ({}, use) => {
    // a random id to avoid conflicts between tests
    const id = generateUUID();
    const electronApp = await electron.launch({
      args: [resolve(__dirname, '..'), '--app-name', 'affine-test-' + id],
      executablePath: resolve(__dirname, '../node_modules/.bin/electron'),
      colorScheme: 'light',
    });
    const sessionDataPath = await electronApp.evaluate(async ({ app }) => {
      return app.getPath('sessionData');
    });
    await use(electronApp);
    await fs.rm(sessionDataPath, { recursive: true, force: true });
  },
  appInfo: async ({ electronApp }, use) => {
    const appInfo = await electronApp.evaluate(async ({ app }) => {
      return {
        appPath: app.getAppPath(),
        appData: app.getPath('appData'),
        sessionData: app.getPath('sessionData'),
      };
    });
    await use(appInfo);
  },
  workspace: async ({ page }, use) => {
    await use({
      current: async () => {
        return await page.evaluate(async () => {
          // @ts-expect-error
          return globalThis.currentWorkspace;
        });
      },
    });
  },
});
