import path from 'node:path';

import type { apis } from '@affine/electron-api';
import { cleanupElectronApp, test } from '@affine-test/kit/electron';
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
import { expect, type Page } from '@playwright/test';
import fs from 'fs-extra';
import { _electron as electron } from 'playwright';

declare global {
  interface Window {
    __apis: typeof apis;
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
    const content = (await fs.readFile(file, 'utf8')).replaceAll('\\_', '_');
    if (content.includes(needle)) {
      return file;
    }
  }
  return null;
}

async function ensureWorkspaceSelected(page: Page, name: string) {
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

async function configureDiskSync(
  page: Page,
  workspaceId: string,
  workspaceName: string,
  folder: string
) {
  const maybeAutoReload = page
    .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20_000 })
    .catch(() => null);
  await page.evaluate(
    async ({ workspaceId, folder }) => {
      const apis = window.__apis;
      if (!apis) {
        throw new Error('desktop APIs are unavailable');
      }
      const loc = window.location as Location & { reload: () => void };
      const originalReload = loc.reload.bind(loc);
      try {
        loc.reload = () => {};
      } catch {}

      await apis.sharedStorage.setGlobalState(
        'workspace-engine:disk-sync-folders:v1',
        { [workspaceId]: folder }
      );
      await apis.sharedStorage.setGlobalState(
        'affine-flag:enable_disk_sync',
        true
      );

      try {
        loc.reload = originalReload;
      } catch {}
    },
    { workspaceId, folder }
  );
  await maybeAutoReload;
  try {
    await page.reload({ waitUntil: 'domcontentloaded' });
  } catch {}
  await waitForEditorLoad(page);
  await ensureWorkspaceSelected(page, workspaceName);
}

test('disk markdown sync: export/update/import', async ({
  page,
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

  await configureDiskSync(page, w.meta.id, workspaceName, syncFolder);

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

  // 2) Workspace changes propose a candidate for an existing Markdown file.
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);
  const docAId = /^id: (.+)$/m.exec(await fs.readFile(fileA, 'utf8'))?.[1];
  expect(docAId).toBeTruthy();
  await page
    .locator(`[data-testid="doc-list-item"][data-doc-id="${docAId}"]`)
    .click();
  await waitForEditorLoad(page);

  const bodyA2 = `SYNC_E2E_BODY_A_UPDATE_${runId}`;
  await page.locator('affine-note').first().click();
  await page.keyboard.type(bodyA2);

  await expect
    .poll(
      () =>
        findMarkdownFileContaining(
          path.join(syncFolder, '.affine-sync', 'candidates'),
          bodyA2
        ),
      {
        timeout: 30_000,
      }
    )
    .not.toBeNull();
  expect(
    (await fs.readFile(fileA, 'utf8')).replaceAll('\\_', '_').includes(bodyA2)
  ).toBe(false);
  const candidate = await findMarkdownFileContaining(
    path.join(syncFolder, '.affine-sync', 'candidates'),
    bodyA2
  );
  if (!candidate) {
    throw new Error('candidate for doc A not found');
  }
  await fs.copyFile(candidate, fileA);

  // 3) Local Markdown changes should be imported back into the workspace.
  const mdEdit = `SYNC_E2E_MD_EDIT_${runId}`;
  const previous = await fs.readFile(fileA, 'utf8');
  await fs.writeFile(fileA, previous + `\n\n${mdEdit}\n`, 'utf8');

  const note = page.locator('affine-note').first();
  await expect(note.getByText(mdEdit)).toBeVisible({
    timeout: 30_000,
  });
});

test('disk markdown sync: switching folders re-exports existing docs', async ({
  page,
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

  const setFolder = (folder: string) =>
    configureDiskSync(page, w.meta.id, workspaceName, folder);

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

test('disk markdown sync: imports source edits after app restart', async ({
  page,
  electronApp,
  appInfo,
  workspace,
}) => {
  test.setTimeout(180_000);

  const runId = Date.now();
  const workspaceName = `disk-sync-restart-${runId}`;
  await createLocalWorkspace({ name: workspaceName }, page);

  const title = `disk-sync-restart-page-${runId}`;
  const body = `SYNC_E2E_RESTART_BODY_${runId}`;
  await clickNewPageButton(page, title);
  await page.locator('affine-note').first().click();
  await page.keyboard.type(body);

  const w = await workspace.current();
  const syncFolder = path.join(
    appInfo.sessionData,
    'disk-sync-e2e-restart',
    w.meta.id
  );
  await fs.emptyDir(syncFolder);
  await configureDiskSync(page, w.meta.id, workspaceName, syncFolder);
  await expect
    .poll(() => findMarkdownFileContaining(syncFolder, body), {
      timeout: 30_000,
    })
    .not.toBeNull();
  const mdFile = await findMarkdownFileContaining(syncFolder, body);
  if (!mdFile) {
    throw new Error('exported markdown before restart not found');
  }
  await cleanupElectronApp(electronApp);
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value) {
      env[key] = value;
    }
  }
  env.SKIP_ONBOARDING = '1';
  env.AFFINE_E2E ||= '1';
  delete env.ELECTRON_RUN_AS_NODE;
  const restarted = await electron.launch({
    args: [appInfo.appPath],
    cwd: appInfo.appPath,
    env,
    colorScheme: 'light',
  });
  try {
    let reopenedPage: Page | undefined;
    await expect
      .poll(
        async () => {
          for (const candidate of restarted.windows()) {
            if (await candidate.locator('v-line').count()) {
              reopenedPage = candidate;
              return true;
            }
          }
          return false;
        },
        { timeout: 30_000 }
      )
      .toBe(true);
    if (!reopenedPage) {
      throw new Error('restarted workspace page not found');
    }

    await ensureWorkspaceSelected(reopenedPage, workspaceName);
    await clickSideBarAllPageButton(reopenedPage);
    await waitForAllPagesLoad(reopenedPage);
    await getPageByTitle(reopenedPage, title).click();
    await waitForEditorLoad(reopenedPage);

    const mdEdit = `SYNC_E2E_RESTART_EDIT_${runId}`;
    await fs.appendFile(mdFile, `\n\n${mdEdit}\n`, 'utf8');
    await expect(
      reopenedPage.locator('affine-note').first().getByText(mdEdit)
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    await cleanupElectronApp(restarted);
  }
});

test('disk markdown sync: preserves database blocks', async ({
  page,
  appInfo,
  workspace,
}) => {
  test.setTimeout(120_000);

  const runId = Date.now();

  const workspaceName = `disk-sync-db-e2e-${runId}`;
  await createLocalWorkspace({ name: workspaceName }, page);

  const title = `disk-sync-db-${runId}`;
  const dbTitle = `SYNC_E2E_DB_TITLE_${runId}`;
  const dbBody = `SYNC_E2E_DB_BODY_${runId}`;
  await clickNewPageButton(page, title);
  await page.locator('affine-note').first().click();
  await page.keyboard.type(dbBody);
  await page.keyboard.press('Enter');
  await addDatabase(page, dbTitle);

  const w = await workspace.current();
  const syncFolder = path.join(
    appInfo.sessionData,
    'disk-sync-db-e2e',
    w.meta.id
  );
  await fs.emptyDir(syncFolder);

  await configureDiskSync(page, w.meta.id, workspaceName, syncFolder);

  // Ensure we're viewing the target page so UI assertions below are stable.
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);
  await getPageByTitle(page, title).click();
  await waitForEditorLoad(page);

  await expect
    .poll(() => findMarkdownFileContaining(syncFolder, dbBody), {
      timeout: 30_000,
    })
    .not.toBeNull();

  const mdFile = await findMarkdownFileContaining(syncFolder, dbBody);
  if (!mdFile) {
    throw new Error('exported markdown for db doc not found');
  }

  const mdEdit = `SYNC_E2E_DB_MD_EDIT_${runId}`;
  const previous = await fs.readFile(mdFile, 'utf8');
  await fs.writeFile(mdFile, previous + `\n\n${mdEdit}\n`, 'utf8');

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
