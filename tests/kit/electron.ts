import crypto from 'node:crypto';
import { join, resolve } from 'node:path';

import type { Page } from '@playwright/test';
import fs from 'fs-extra';
import type { ElectronApplication } from 'playwright';
import { _electron as electron } from 'playwright';

import {
  enableCoverage,
  istanbulTempDir,
  test as base,
  testResultDir,
} from './playwright';
import { removeWithRetry } from './utils/utils';

const projectRoot = join(__dirname, '..', '..');
const electronRoot = join(projectRoot, 'packages/frontend/electron');

function generateUUID() {
  return crypto.randomUUID();
}

type RoutePath = 'setting';

export const test = base.extend<{
  electronApp: ElectronApplication;
  appInfo: {
    appPath: string;
    appData: string;
    sessionData: string;
  };
  router: {
    goto: (path: RoutePath) => Promise<void>;
  };
}>({
  page: async ({ electronApp }, use) => {
    const page = await electronApp.firstWindow();
    await page.getByTestId('onboarding-modal-close-button').click({
      delay: 100,
    });
    // wait for blocksuite to be loaded
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
    await use(page as Page);
    if (enableCoverage) {
      await page.evaluate(() =>
        // @ts-expect-error
        window.collectIstanbulCoverage(JSON.stringify(window.__coverage__))
      );
    }
    await page.close();
  },
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    // a random id to avoid conflicts between tests
    const id = generateUUID();
    const ext = process.platform === 'win32' ? '.cmd' : '';
    const dist = resolve(electronRoot, 'dist');
    const clonedDist = resolve(electronRoot, 'e2e-dist-' + id);
    await fs.copy(dist, clonedDist);
    const packageJson = await fs.readJSON(
      resolve(electronRoot, 'package.json')
    );
    // overwrite the app name
    packageJson.name = 'affine-test-' + id;
    // overwrite the path to the main script
    packageJson.main = './main.js';
    // write to the cloned dist
    await fs.writeJSON(resolve(clonedDist, 'package.json'), packageJson);

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value) {
        env[key] = value;
      }
    }

    if (process.env.DEV_SERVER_URL) {
      env.DEV_SERVER_URL = process.env.DEV_SERVER_URL;
    }

    const electronApp = await electron.launch({
      args: [clonedDist],
      env,
      executablePath: resolve(
        projectRoot,
        'node_modules',
        '.bin',
        `electron${ext}`
      ),
      cwd: clonedDist,
      recordVideo: {
        dir: testResultDir,
      },
      colorScheme: 'light',
    });
    await use(electronApp);
    try {
      await removeWithRetry(clonedDist);
    } catch (error) {
      console.log(error);
    }
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
});
