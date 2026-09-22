import path from 'node:path';

import type { apis } from '@affine/electron-api';
import { test } from '@affine-test/kit/electron';
import {
  addDatabase,
  clickNewPageButton,
  getPageByTitle,
  waitForAllPagesLoad,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import {
  createLocalWorkspace,
  openWorkspaceListModal,
} from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';
import fs from 'fs-extra';

declare global {
  interface Window {
    __apis: typeof apis;
    __events?: any;
  }
}

async function collectMarkdownFiles(root: string): Promise<string[]> {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const out: string[] = [];

  for (const entry of entries) {
    if (entry.name === '.affine-sync') {
      continue;
    }

    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await collectMarkdownFiles(fullPath)));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(fullPath);
    }
  }

  return out;
}

async function findMarkdownFileContaining(
  root: string,
  needle: string
): Promise<string | null> {
  const files = await collectMarkdownFiles(root);
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    if (content.includes(needle)) {
      return file;
    }
  }
  return null;
}

async function ensureWorkspaceSelected(page: any, name: string) {
  const currentName =
    (await page
      .getByTestId('app-sidebar')
      .getByTestId('workspace-name')
      .textContent()
      .catch(() => null)) ?? '';
  if (currentName.trim() === name) {
    return;
  }

  await openWorkspaceListModal(page);
  // Workspace cards are rendered in the selector popup.
  await page
    .getByTestId('workspace-card')
    .filter({ hasText: name })
    .first()
    .click();

  await expect(
    page.getByTestId('app-sidebar').getByTestId('workspace-name')
  ).toHaveText(name, { timeout: 10_000 });

  await waitForEditorLoad(page);
}

async function assertNbstoreOpenedWithDiskRemote(
  page: any,
  shell: any,
  syncFolder: string
) {
  const opened = async () => {
    const [pageOpenStoreLogs, shellOpenStoreLogs] = await Promise.all([
      page.evaluate(() => {
        return (globalThis as any).__e2eNbstoreOpenStoreLogs ?? [];
      }),
      shell.evaluate(() => {
        return (globalThis as any).__e2eNbstoreOpenStoreLogs ?? [];
      }),
    ]);
    const openStoreLogs = [...pageOpenStoreLogs, ...shellOpenStoreLogs];
    return openStoreLogs.some(
      (l: any) =>
        l?.remotes?.includes?.('disk') && l?.diskSyncFolder === syncFolder
    );
  };

  try {
    await expect.poll(opened, { timeout: 20_000 }).toBe(true);
  } catch {
    const [pageOpenStoreLogs, shellOpenStoreLogs] = await Promise.all([
      page.evaluate(() => {
        return (globalThis as any).__e2eNbstoreOpenStoreLogs ?? [];
      }),
      shell.evaluate(() => {
        return (globalThis as any).__e2eNbstoreOpenStoreLogs ?? [];
      }),
    ]);
    throw new Error(
      `nbstore.openStore did not include disk remote (expected syncFolder=${syncFolder}). ` +
        `PageLogs: ${JSON.stringify(pageOpenStoreLogs.slice(-10), null, 2)} ` +
        `ShellLogs: ${JSON.stringify(shellOpenStoreLogs.slice(-10), null, 2)}`
    );
  }
}

test('disk markdown sync: export/update/import', async ({
  page,
  shell,
  appInfo,
  workspace,
}) => {
  test.setTimeout(120_000);

  const runId = Date.now();

  const workspaceName = `disk-sync-e2e-${runId}`;
  await createLocalWorkspace({ name: workspaceName }, page);

  const titleA = `disk-sync-a-${runId}`;
  const bodyA1 = `SYNC_E2E_BODY_A_${runId}`;
  await clickNewPageButton(page, titleA);
  await page.locator('affine-note').first().click();
  await page.keyboard.type(bodyA1);

  const titleB = `disk-sync-b-${runId}`;
  const bodyB1 = `SYNC_E2E_BODY_B_${runId}`;
  await clickNewPageButton(page, titleB);
  await page.locator('affine-note').first().click();
  await page.keyboard.type(bodyB1);

  const w = await workspace.current();
  const syncFolder = path.join(appInfo.sessionData, 'disk-sync-e2e', w.meta.id);
  await fs.emptyDir(syncFolder);

  // Configure via globalState directly to avoid coupling this E2E to the UI panel.
  const maybeAutoReload = page
    .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20_000 })
    .catch(() => null);
  await page.evaluate(
    async ({ workspaceId, folder }) => {
      const apis = (window as any).__apis;
      if (!apis?.sharedStorage?.setGlobalState) {
        throw new Error('sharedStorage api is not available');
      }

      // FeatureFlagService will reload the page when the flag changes.
      // Override it temporarily so we can persist state first, then reload from the test.
      const loc = window.location as any;
      const originalReload = loc.reload?.bind(loc);
      try {
        loc.reload = () => {};
      } catch {
        // ignore if it is not writable
      }

      await apis.sharedStorage.setGlobalState(
        'workspace-engine:disk-sync-folders:v1',
        {
          [workspaceId]: folder,
        }
      );
      await apis.sharedStorage.setGlobalState(
        'affine-flag:enable_disk_sync',
        true
      );

      try {
        loc.reload = originalReload;
      } catch {
        // ignore if it is not writable
      }
    },
    { workspaceId: w.meta.id, folder: syncFolder }
  );
  await maybeAutoReload;
  // If we blocked the auto reload, reload now so workspace-engine can pick up the remote options.
  // If the app already navigated, Playwright will throw ERR_ABORTED here; just ignore.
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
  } catch {}
  await waitForEditorLoad(page);
  await ensureWorkspaceSelected(page, workspaceName);
  await workspace.current();

  const folderConfig = await page.evaluate(
    ({ workspaceId }) => {
      const gs = (globalThis as any).__sharedStorage?.globalState;
      const folders = gs?.get('workspace-engine:disk-sync-folders:v1');
      return {
        hasSharedStorage: !!gs,
        enabled: gs?.get('affine-flag:enable_disk_sync'),
        folder: folders?.[workspaceId] ?? null,
        folderKeyType: typeof folders,
      };
    },
    { workspaceId: w.meta.id }
  );
  expect(folderConfig.hasSharedStorage).toBe(true);
  expect(folderConfig.enabled).toBe(true);
  expect(folderConfig.folder).toBe(syncFolder);

  await assertNbstoreOpenedWithDiskRemote(page, shell, syncFolder);

  // Collect disk events for debugging and for asserting the import pipeline actually fired.
  await page.evaluate(() => {
    (globalThis as any).__e2eDiskEvents = [];
    const onEvent = (window as any).__events?.diskSync?.onEvent;
    if (typeof onEvent !== 'function') {
      throw new Error('diskSync event api is not available');
    }
    const off = onEvent((payload: any) => {
      const ev = payload?.event;
      const update = ev?.update;
      (globalThis as any).__e2eDiskEvents.push({
        sessionId: payload?.sessionId,
        type: ev?.type,
        origin: ev?.origin,
        docId: update?.docId ?? ev?.docId ?? null,
        timestamp: (update?.timestamp ?? ev?.timestamp ?? null)?.toString?.(),
        binLen: update?.bin?.length ?? null,
      });
    });
    (globalThis as any).__e2eDiskEventsOff = off;
  });

  // 1) First-time linking: existing workspace docs should be exported to Markdown.
  await expect
    .poll(() => findMarkdownFileContaining(syncFolder, bodyA1), {
      timeout: 30_000,
    })
    .not.toBeNull();
  await expect
    .poll(() => findMarkdownFileContaining(syncFolder, bodyB1), {
      timeout: 30_000,
    })
    .not.toBeNull();

  const fileA = await findMarkdownFileContaining(syncFolder, bodyA1);
  if (!fileA) {
    throw new Error('exported markdown for doc A not found');
  }

  // 2) Workspace changes should update the corresponding Markdown file.
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);
  await getPageByTitle(page, titleA).click();
  await waitForEditorLoad(page);

  const bodyA2 = `SYNC_E2E_BODY_A_UPDATE_${runId}`;
  await page.locator('affine-note').first().click();
  await page.keyboard.press('Enter');
  await page.keyboard.type(bodyA2);

  await expect
    .poll(async () => (await fs.readFile(fileA, 'utf8')).includes(bodyA2), {
      timeout: 30_000,
    })
    .toBe(true);

  // 3) Local Markdown changes should be imported back into the workspace.
  const mdEdit = `SYNC_E2E_MD_EDIT_${runId}`;
  const previous = await fs.readFile(fileA, 'utf8');
  await fs.writeFile(fileA, previous + `\n\n${mdEdit}\n`, 'utf8');

  // Ensure the disk import pipeline actually emitted an event for the file edit.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const events = (globalThis as any).__e2eDiskEvents ?? [];
          return events.some(
            (e: any) =>
              e?.type === 'doc-update' && e?.origin === 'disk:file-import'
          );
        }),
      { timeout: 30_000 }
    )
    .toBe(true);

  const note = page.locator('affine-note').first();
  await expect(note.getByText(mdEdit)).toBeVisible({
    timeout: 30_000,
  });
});

test('disk markdown sync: switching folders re-exports existing docs', async ({
  page,
  shell,
  appInfo,
  workspace,
}) => {
  test.setTimeout(150_000);

  const runId = Date.now();

  const workspaceName = `disk-sync-switch-${runId}`;
  await createLocalWorkspace({ name: workspaceName }, page);

  const title = `disk-sync-switch-page-${runId}`;
  const body = `SYNC_E2E_SWITCH_BODY_${runId}`;
  await clickNewPageButton(page, title);
  await page.locator('affine-note').first().click();
  await page.keyboard.type(body);

  const w = await workspace.current();
  const folderA = path.join(
    appInfo.sessionData,
    'disk-sync-e2e-switch',
    w.meta.id,
    'a'
  );
  const folderB = path.join(
    appInfo.sessionData,
    'disk-sync-e2e-switch',
    w.meta.id,
    'b'
  );
  await fs.emptyDir(folderA);
  await fs.emptyDir(folderB);

  const setFolder = async (folder: string) => {
    const maybeAutoReload = page
      .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20_000 })
      .catch(() => null);
    await page.evaluate(
      async ({ workspaceId, folder }) => {
        const apis = (window as any).__apis;
        if (!apis?.sharedStorage?.setGlobalState) {
          throw new Error('sharedStorage api is not available');
        }

        const loc = window.location as any;
        const originalReload = loc.reload?.bind(loc);
        try {
          loc.reload = () => {};
        } catch {}

        await apis.sharedStorage.setGlobalState(
          'workspace-engine:disk-sync-folders:v1',
          {
            [workspaceId]: folder,
          }
        );
        await apis.sharedStorage.setGlobalState(
          'affine-flag:enable_disk_sync',
          true
        );

        try {
          loc.reload = originalReload;
        } catch {}
      },
      { workspaceId: w.meta.id, folder }
    );
    await maybeAutoReload;
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
    } catch {}
    await waitForEditorLoad(page);
    await ensureWorkspaceSelected(page, workspaceName);
    await workspace.current();

    const folderConfig = await page.evaluate(
      ({ workspaceId, expectedFolder }) => {
        const gs = (globalThis as any).__sharedStorage?.globalState;
        const folders = gs?.get('workspace-engine:disk-sync-folders:v1');
        return {
          hasSharedStorage: !!gs,
          enabled: gs?.get('affine-flag:enable_disk_sync'),
          folder: folders?.[workspaceId] ?? null,
          expected: expectedFolder,
        };
      },
      { workspaceId: w.meta.id, expectedFolder: folder }
    );
    expect(folderConfig.hasSharedStorage).toBe(true);
    expect(folderConfig.enabled).toBe(true);
    expect(folderConfig.folder).toBe(folder);

    await assertNbstoreOpenedWithDiskRemote(page, shell, folder);
  };

  // First bind: export should appear in folder A.
  await setFolder(folderA);
  await expect
    .poll(() => findMarkdownFileContaining(folderA, body), { timeout: 30_000 })
    .not.toBeNull();

  // Switch to a brand new empty folder: export should appear again in folder B.
  await setFolder(folderB);
  await expect
    .poll(() => findMarkdownFileContaining(folderB, body), { timeout: 30_000 })
    .not.toBeNull();
});

test('disk markdown sync: preserves database blocks', async ({
  page,
  shell,
  appInfo,
  workspace,
}) => {
  test.setTimeout(120_000);

  const runId = Date.now();

  const workspaceName = `disk-sync-db-e2e-${runId}`;
  await createLocalWorkspace({ name: workspaceName }, page);

  const title = `disk-sync-db-${runId}`;
  const dbTitle = `SYNC_E2E_DB_TITLE_${runId}`;
  await clickNewPageButton(page, title);
  await page.locator('affine-note').first().click();
  await page.keyboard.type(`SYNC_E2E_DB_BODY_${runId}`);
  await page.keyboard.press('Enter');
  await addDatabase(page, dbTitle);

  const w = await workspace.current();
  const syncFolder = path.join(
    appInfo.sessionData,
    'disk-sync-db-e2e',
    w.meta.id
  );
  await fs.emptyDir(syncFolder);

  const maybeAutoReload = page
    .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20_000 })
    .catch(() => null);
  await page.evaluate(
    async ({ workspaceId, folder }) => {
      const apis = (window as any).__apis;
      if (!apis?.sharedStorage?.setGlobalState) {
        throw new Error('sharedStorage api is not available');
      }

      const loc = window.location as any;
      const originalReload = loc.reload?.bind(loc);
      try {
        loc.reload = () => {};
      } catch {}

      await apis.sharedStorage.setGlobalState(
        'workspace-engine:disk-sync-folders:v1',
        {
          [workspaceId]: folder,
        }
      );
      await apis.sharedStorage.setGlobalState(
        'affine-flag:enable_disk_sync',
        true
      );

      try {
        loc.reload = originalReload;
      } catch {}
    },
    { workspaceId: w.meta.id, folder: syncFolder }
  );
  await maybeAutoReload;
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
  } catch {}
  await waitForEditorLoad(page);
  await ensureWorkspaceSelected(page, workspaceName);
  await workspace.current();

  const folderConfig = await page.evaluate(
    ({ workspaceId, folder }) => {
      const gs = (globalThis as any).__sharedStorage?.globalState;
      const folders = gs?.get('workspace-engine:disk-sync-folders:v1');
      return {
        hasSharedStorage: !!gs,
        enabled: gs?.get('affine-flag:enable_disk_sync'),
        folder: folders?.[workspaceId] ?? null,
        expected: folder,
      };
    },
    { workspaceId: w.meta.id, folder: syncFolder }
  );
  expect(folderConfig.hasSharedStorage).toBe(true);
  expect(folderConfig.enabled).toBe(true);
  expect(folderConfig.folder).toBe(syncFolder);

  await assertNbstoreOpenedWithDiskRemote(page, shell, syncFolder);

  // Ensure we're viewing the target page so UI assertions below are stable.
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);
  await getPageByTitle(page, title).click();
  await waitForEditorLoad(page);

  await page.evaluate(() => {
    (globalThis as any).__e2eDiskEvents = [];
    const onEvent = (window as any).__events?.diskSync?.onEvent;
    if (typeof onEvent !== 'function') {
      throw new Error('diskSync event api is not available');
    }
    const off = onEvent((payload: any) => {
      const ev = payload?.event;
      const update = ev?.update;
      (globalThis as any).__e2eDiskEvents.push({
        sessionId: payload?.sessionId,
        type: ev?.type,
        origin: ev?.origin,
        docId: update?.docId ?? ev?.docId ?? null,
        timestamp: (update?.timestamp ?? ev?.timestamp ?? null)?.toString?.(),
        binLen: update?.bin?.length ?? null,
      });
    });
    (globalThis as any).__e2eDiskEventsOff = off;
  });

  await expect
    .poll(() => findMarkdownFileContaining(syncFolder, dbTitle), {
      timeout: 30_000,
    })
    .not.toBeNull();

  const mdFile = await findMarkdownFileContaining(syncFolder, dbTitle);
  if (!mdFile) {
    throw new Error('exported markdown for db doc not found');
  }

  // Ensure the exported file includes the database end marker so we can append after it.
  await expect
    .poll(
      async () =>
        (await fs.readFile(mdFile, 'utf8')).includes(
          'flavour=affine:database end'
        ),
      {
        timeout: 30_000,
      }
    )
    .toBe(true);

  const mdEdit = `SYNC_E2E_DB_MD_EDIT_${runId}`;
  const previous = await fs.readFile(mdFile, 'utf8');
  await fs.writeFile(mdFile, previous + `\n\n${mdEdit}\n`, 'utf8');

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const events = (globalThis as any).__e2eDiskEvents ?? [];
          return events.some(
            (e: any) =>
              e?.type === 'doc-update' && e?.origin === 'disk:file-import'
          );
        }),
      { timeout: 30_000 }
    )
    .toBe(true);

  await expect(
    page.locator('affine-note').first().getByText(mdEdit)
  ).toBeVisible({
    timeout: 30_000,
  });

  // Database block should remain a database, not be replaced by markdown blocks.
  await expect(page.getByTestId('dv-table-view').first()).toBeVisible({
    timeout: 30_000,
  });
});
