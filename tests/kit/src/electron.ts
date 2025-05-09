import crypto from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { Package } from '@affine-tools/utils/workspace';
import { expect, type Page } from '@playwright/test';
import fs from 'fs-extra';
import type { ElectronApplication } from 'playwright';
import { _electron as electron } from 'playwright';

import { test as base, testResultDir } from './playwright';
import { removeWithRetry } from './utils/utils';

const electronRoot = new Package('@affine/electron').path;

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
          timeout: 10000,
        }
      )
      .toBeTruthy();

    await expect
      .poll(
        async () => {
          const page = await getActivePage(electronApp.windows());
          return !!page;
        },
        {
          timeout: 10000,
        }
      )
      .toBeTruthy();

    const page = await getActivePage(electronApp.windows());

    if (!page) {
      throw new Error('No active page found');
    }

    // wait for blocksuite to be loaded
    await page.waitForSelector('v-line');

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
  // oxlint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    try {
      // a random id to avoid conflicts between tests
      const id = generateUUID();
      const dist = electronRoot.join('dist').value;
      const clonedDist = electronRoot.join('e2e-dist-' + id).value;
      await fs.copy(dist, clonedDist);
      const packageJson = await fs.readJSON(
        electronRoot.join('package.json').value
      );
      // overwrite the app name
      packageJson.name = '@affine/electron-test-' + id;
      // overwrite the path to the main script
      packageJson.main = './main.js';
      // write to the cloned dist
      await fs.writeJSON(clonedDist + '/package.json', packageJson);

      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value) {
          env[key] = value;
        }
      }
      env.DEBUG = 'pw:browser';

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
      const cleanup = async () => {
        const pages = electronApp.windows();
        for (const page of pages) {
          if (page.isClosed()) {
            continue;
          }
          await page.close();
        }
        await electronApp.close();
        await removeWithRetry(clonedDist);
      };
      await Promise.race([
        // cleanup may stuck and fail the test, but it should be fine.
        cleanup(),
        setTimeout(10000).then(() => {
          // kill the electron app if it is not closed after 10 seconds
          electronApp.process().kill();
        }),
      ]);
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
