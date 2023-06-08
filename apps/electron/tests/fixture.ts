/* eslint-disable no-empty-pattern */
import crypto from 'node:crypto';
import { join, resolve } from 'node:path';

import {
  enableCoverage,
  istanbulTempDir,
  test as base,
  testResultDir,
} from '@affine-test/kit/playwright';
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
      // @ts-expect-error
      return window.apis?.debug.logFilePath();
    });
    // wat for blocksuite to be loaded
    await page.waitForSelector('v-line');
    if (enableCoverage) {
      await fs.promises.mkdir(istanbulTempDir, { recursive: true });
      await page.exposeFunction(
        'collectIstanbulCoverage',
        (coverageJSON?: string) => {
          if (coverageJSON)
            fs.writeFileSync(
              join(
                istanbulTempDir,
                `playwright_coverage_${generateUUID()}.json`
              ),
              coverageJSON
            );
        }
      );
    }
    await use(page);
    if (enableCoverage) {
      await page.evaluate(() =>
        // @ts-expect-error
        window.collectIstanbulCoverage(JSON.stringify(window.__coverage__))
      );
    }
    await page.close();
    if (logFilePath) {
      const logs = await fs.readFile(logFilePath, 'utf-8');
      console.log(logs);
    }
  },
  electronApp: async ({}, use) => {
    // a random id to avoid conflicts between tests
    const id = generateUUID();
    const ext = process.platform === 'win32' ? '.cmd' : '';
    const electronApp = await electron.launch({
      args: [resolve(__dirname, '..'), '--app-name', 'affine-test-' + id],
      executablePath: resolve(
        __dirname,
        '..',
        'node_modules',
        '.bin',
        `electron${ext}`
      ),
      recordVideo: {
        dir: testResultDir,
      },
      colorScheme: 'light',
    });
    await use(electronApp);
    // FIXME: the following does not work well on CI
    // const sessionDataPath = await electronApp.evaluate(async ({ app }) => {
    //   return app.getPath('sessionData');
    // });
    // await fs.rm(sessionDataPath, { recursive: true, force: true });
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
