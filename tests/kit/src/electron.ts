import type { ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

import { Package } from '@affine-tools/utils/workspace';
import type { Page } from '@playwright/test';
import fs from 'fs-extra';
import type { ElectronApplication } from 'playwright';
import { _electron as electron } from 'playwright';
import treeKill from 'tree-kill';

import { test as base } from './playwright';
import { removeWithRetry } from './utils/utils';

const electronRoot = new Package('@affine/electron').path;

const treeKillAsync = (pid: number, signal: NodeJS.Signals) =>
  new Promise<void>((resolve, reject) => {
    treeKill(pid, signal, error => {
      if (
        !error ||
        ('code' in error &&
          typeof error.code === 'string' &&
          error.code === 'ESRCH')
      ) {
        resolve();
        return;
      }
      reject(error);
    });
  });

function generateUUID() {
  return crypto.randomUUID();
}

type RoutePath = 'setting';

type StreamLike = {
  destroyed?: boolean;
  destroy?: () => void;
};

const tryDestroyStream = (stream: StreamLike | null | undefined) => {
  if (!stream || stream.destroyed || typeof stream.destroy !== 'function') {
    return;
  }

  try {
    stream.destroy();
  } catch {}
};

const releaseChildProcessHandles = (child: ChildProcess) => {
  if (child.connected) {
    try {
      child.disconnect();
    } catch {}
  }

  tryDestroyStream(child.stdin);
  tryDestroyStream(child.stdout);
  tryDestroyStream(child.stderr);

  for (const stream of child.stdio) {
    if (
      stream !== child.stdin &&
      stream !== child.stdout &&
      stream !== child.stderr
    ) {
      tryDestroyStream(stream as StreamLike | null | undefined);
    }
  }
};

const withTimeoutFallback = async <T>(promise: Promise<T>, fallback: T) => {
  try {
    return await Promise.race([
      promise,
      setTimeout(1_000).then(() => fallback),
    ]);
  } catch {
    return fallback;
  }
};

const getPageId = async (page: Page) => {
  return await withTimeoutFallback(
    page.evaluate(() => {
      return (window.__appInfo as any)?.viewId as string | undefined;
    }),
    undefined
  );
};

const isActivePage = async (page: Page) => {
  return await withTimeoutFallback(
    page.evaluate(async () => {
      return (await (window as any).__apis?.ui.isActiveTab()) === true;
    }),
    false
  );
};

const isEditorPage = async (page: Page) => {
  return await withTimeoutFallback(
    page
      .locator('v-line')
      .count()
      .then(count => count > 0),
    false
  );
};

const getActivePage = async (pages: Page[]) => {
  for (const page of pages) {
    if (await isActivePage(page)) {
      return page;
    }
  }

  const contentPages: Page[] = [];
  for (const page of pages) {
    const pageId = await getPageId(page);
    if (pageId === 'shell') {
      continue;
    }
    if (pageId || (await isEditorPage(page))) {
      contentPages.push(page);
    }
  }

  if (contentPages.length > 0) {
    return contentPages.at(-1) ?? null;
  }

  return null;
};

const getShellPage = async (pages: Page[]) => {
  for (const page of pages) {
    if ((await getPageId(page)) === 'shell') {
      return page;
    }
  }
  return null;
};

const waitForElectronPage = async (
  electronApp: ElectronApplication,
  label: string,
  getPage: (pages: Page[]) => Promise<Page | null>
) => {
  const deadline =
    Date.now() +
    (process.env.CI && process.platform === 'darwin' ? 20_000 : 10_000);

  while (Date.now() < deadline) {
    const page = await getPage(electronApp.windows());
    if (page) {
      return page;
    }

    await setTimeout(250);
  }

  throw new Error(`Timed out waiting for ${label}`);
};

const cleanupElectronApp = async (electronApp: ElectronApplication) => {
  const child = electronApp.process();
  const waitForAppClose = () =>
    new Promise<void>(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      electronApp.once('close', () => resolve());
    });
  const waitForProcessExit = () =>
    new Promise<void>(resolve => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      child.once('exit', () => resolve());
    });

  const killProcess = () => {
    try {
      child.kill();
    } catch {}
  };

  const closeWithTimeout = async () => {
    const closeEvent = waitForAppClose();
    const controller = new AbortController();
    const killAfterTimeout = setTimeout(10_000, undefined, {
      signal: controller.signal,
    })
      .then(() => {
        killProcess();
      })
      .catch(error => {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        throw error;
      });

    try {
      await Promise.all([electronApp.close().catch(() => {}), closeEvent]);
    } finally {
      controller.abort();
      await killAfterTimeout;
    }
  };

  if (process.env.CI && process.platform === 'linux') {
    const pid = child.pid;
    const closeEvent = waitForAppClose();
    const processExit = waitForProcessExit();

    await Promise.race([
      Promise.all([
        electronApp.close().catch(() => {}),
        closeEvent,
        processExit,
      ]),
      setTimeout(2_000),
    ]).catch(() => {});

    if (
      pid !== undefined &&
      child.exitCode === null &&
      child.signalCode === null
    ) {
      await treeKillAsync(pid, 'SIGKILL').catch(() => {});
    }

    releaseChildProcessHandles(child);

    await Promise.race([closeEvent, processExit, setTimeout(5_000)]).catch(
      () => {}
    );
    return;
  }

  await closeWithTimeout();
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
    const shell = await waitForElectronPage(
      electronApp,
      'shell page',
      getShellPage
    );

    await use(shell);
  },
  page: async ({ electronApp }, use) => {
    const page = await waitForElectronPage(
      electronApp,
      'active page',
      getActivePage
    );

    await page.waitForSelector('v-line');

    await use(page);
  },
  views: async ({ electronApp, page }, use) => {
    void page;
    await use({
      getActive: async () => {
        const view = await getActivePage(electronApp.windows());
        return view || page;
      },
    });
  },
  // oxlint-disable-next-line no-empty-pattern
  electronApp: async ({}, use) => {
    const id = generateUUID();
    const dist = electronRoot.join('dist').value;
    const clonedDist = electronRoot.join('e2e-dist-' + id).value;
    let electronApp: ElectronApplication | undefined;

    try {
      await fs.copy(dist, clonedDist);
      const packageJson = await fs.readJSON(
        electronRoot.join('package.json').value
      );
      packageJson.name = '@affine/electron-test-' + id;
      packageJson.main = './main.js';
      await fs.writeJSON(clonedDist + '/package.json', packageJson);

      const env: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value) {
          env[key] = value;
        }
      }
      env.DEBUG = 'pw:browser';
      env.SKIP_ONBOARDING = '1';

      electronApp = await electron.launch({
        args: [clonedDist],
        env,
        cwd: clonedDist,
        colorScheme: 'light',
      });

      await use(electronApp);
    } finally {
      if (electronApp) {
        await cleanupElectronApp(electronApp);
      }
      if (await fs.pathExists(clonedDist)) {
        await removeWithRetry(clonedDist);
      }
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
