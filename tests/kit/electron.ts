import crypto from 'node:crypto';
import { join, resolve } from 'node:path';

import { expect, type Page } from '@playwright/test';
import fs from 'fs-extra';
import type { ElectronApplication } from 'playwright';
import { _electron as electron } from 'playwright';

import { test as base, testResultDir } from './playwright';
import { removeWithRetry } from './utils/utils';

const projectRoot = join(__dirname, '..', '..');
const electronRoot = join(projectRoot, 'packages/frontend/apps/electron');

function generateUUID() {
  return crypto.randomUUID();
}

type RoutePath = 'setting';

const getPageId = async (page: Page) => {
  return page.evaluate(() => {
    return (window.__appInfo as any)?.viewId as string;
  });
};

const isActivePage = async (page: Page) => {
  return page.evaluate(async () => {
    return await (window as any).__apis?.ui.isActiveTab();
  });
};

const getActivePage = async (pages: Page[]) => {
  for (const page of pages) {
    if (await isActivePage(page)) {
      return page;
    }
  }
  return null;
};

export const test = base.extend<{
  electronApp: ElectronApplication;
  shell: Page;
  appInfo: {
    appPath: string;
    appData: string;
    sessionData: string;
  };
  views: {
    getActive: () => Promise<Page>;
  };
  router: {
    goto: (path: RoutePath) => Promise<void>;
  };
}>({
  shell: async ({ electronApp }, use) => {
    await expect.poll(() => electronApp.windows().length > 1).toBeTruthy();

    for (const page of electronApp.windows()) {
      const viewId = await getPageId(page);
      if (viewId === 'shell') {
        await use(page);
        break;
      }
    }
  },
  page: async ({ electronApp }, use) => {
    await expect
      .poll(
        () => {
          return electronApp.windows().length > 1;
        },
        {
          timeout: 50000,
        }
      )
      .toBeTruthy();

    const page = await getActivePage(electronApp.windows());

    if (!page) {
      throw new Error('No active page found');
    }

    // wait for blocksuite to be loaded
    await page.waitForSelector('v-line');

    await page.evaluate(() => {
      window.localStorage.setItem('dismissAiOnboarding', 'true');
      window.localStorage.setItem('dismissAiOnboardingEdgeless', 'true');
      window.localStorage.setItem('dismissAiOnboardingLocal', 'true');
    });

    await page.reload({
      timeout: 30000,
    });

    await use(page as Page);
  },
  views: async ({ electronApp, page }, use) => {
    void page; // makes sure page is a dependency
    await use({
      getActive: async () => {
        const view = await getActivePage(electronApp.windows());
        return view || page;
      },
    });
  },
  // eslint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    try {
      // a random id to avoid conflicts between tests
      const id = generateUUID();
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

      env.SKIP_ONBOARDING = '1';

      const electronApp = await electron.launch({
        args: [clonedDist],
        env,
        cwd: clonedDist,
        recordVideo: {
          dir: testResultDir,
        },
        colorScheme: 'light',
      });

      await use(electronApp);
      console.log('Cleaning up...');
      const pages = electronApp.windows();
      for (const page of pages) {
        await page.close();
      }
      await electronApp.close();
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
