import path from 'node:path';

import type { apis } from '@affine/electron-api';
import { test } from '@affine-test/kit/electron';
import {
  getBlockSuiteEditorTitle,
  getPageByTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import {
  clickNewPageButton,
  clickSideBarCurrentWorkspaceBanner,
} from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';
import fs from 'fs-extra';

declare global {
  interface Window {
    __apis: typeof apis;
  }
}

test('check workspace has a DB file', async ({ appInfo, workspace }) => {
  const w = await workspace.current();
  const dbPath = path.join(
    appInfo.sessionData,
    'workspaces',
    'local',
    w.meta.id,
    'storage.db'
  );
  // check if db file exists
  expect(await fs.exists(dbPath)).toBe(true);
});

test('export then add', async ({ page, appInfo, workspace }) => {
  await clickNewPageButton(page);
  const w = await workspace.current();

  await getBlockSuiteEditorTitle(page).fill('test1');

  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await expect(page.getByTestId('setting-modal')).toBeVisible();

  const originalId = w.meta.id;

  const newWorkspaceName = 'new-test-name';

  // goto workspace setting
  await page.getByTestId('workspace-setting:preference').click();
  const input = page.getByTestId('workspace-name-input');
  await expect(input).toBeVisible();

  // change workspace name
  await input.fill(newWorkspaceName);
  await page.getByTestId('save-workspace-name').click();
  await page.waitForSelector('text="Update workspace name success"');

  const tmpPath = path.join(appInfo.sessionData, w.meta.id + '-tmp.db');

  // export db file to tmp folder
  await page.evaluate(tmpPath => {
    return window.__apis?.dialog.setFakeDialogResult({
      filePath: tmpPath,
    });
  }, tmpPath);

  await page.getByTestId('workspace-setting:storage').click();
  await page.getByTestId('export-affine-backup').click();
  await page.waitForSelector('text="Export success"');
  expect(await fs.exists(tmpPath)).toBe(true);

  await page.getByTestId('modal-close-button').click();

  // add workspace
  // we are reusing the same db file so that we don't need to maintain one
  // in the codebase
  await clickSideBarCurrentWorkspaceBanner(page);

  await page.evaluate(tmpPath => {
    return window.__apis?.dialog.setFakeDialogResult({
      filePath: tmpPath,
    });
  }, tmpPath);

  // load the db file
  await page.getByTestId('add-workspace').click();

  // should show "Added Successfully" dialog
  // await page.waitForSelector('text="Added Successfully"');

  await expect
    .poll(async () => {
      const newWorkspace = await workspace.current();
      return newWorkspace.meta.id !== originalId;
    })
    .toBe(true);

  // check its name is correct
  await expect(page.getByTestId('workspace-name')).toHaveText(newWorkspaceName);

  await page.waitForTimeout(1000);

  // find button which has the title "test1"
  await getPageByTitle(page, 'test1').click();
  await waitForEditorLoad(page);
  const title = page.locator('[data-block-is-title] >> text="test1"');
  await expect(title).toBeVisible();
});

test('delete workspace and then restore it from backup', async ({ page }) => {
  //#region 1. create a new workspace
  const newWorkspaceName = 'new-test-name';
  await createLocalWorkspace({ name: newWorkspaceName }, page);
  //#endregion

  //#region 2. create a page in the new workspace (will verify later if it is successfully recovered)
  await clickNewPageButton(page);

  await getBlockSuiteEditorTitle(page).fill('test1');
  //#endregion

  //#region 3. delete the workspace
  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await expect(page.getByTestId('setting-modal')).toBeVisible();

  await page.getByTestId('workspace-setting:preference').click();
  await page.getByTestId('delete-workspace-button').click();
  await page.getByTestId('delete-workspace-input').fill(newWorkspaceName);

  await page.getByTestId('delete-workspace-confirm-button').click();

  // we are back to the original workspace
  await expect(page.getByTestId('workspace-name')).toContainText(
    'Demo Workspace'
  );
  //#endregion

  await page.waitForTimeout(1000);

  //#region 4. restore the workspace from backup
  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await expect(page.getByTestId('setting-modal')).toBeVisible();

  await page.getByTestId('backup-panel-trigger').click();
  await expect(page.getByTestId('backup-workspace-item')).toHaveCount(1);
  await page.getByTestId('backup-workspace-item').click();
  await page.getByRole('menuitem', { name: 'Enable local workspace' }).click();
  const toast = page.locator(
    '[data-sonner-toast]:has-text("Workspace enabled successfully")'
  );
  await expect(toast).toBeVisible();
  await toast.getByRole('button', { name: 'Open' }).click();
  //#endregion

  await page.waitForTimeout(1000);

  // verify the workspace name & page title
  await expect(page.getByTestId('workspace-name')).toContainText(
    newWorkspaceName
  );
  // find button which has the title "test1"
  const test1PageButton = await page.waitForSelector(`text="test1"`);
  await test1PageButton.click();

  const title = page.locator('[data-block-is-title] >> text="test1"');
  await expect(title).toBeVisible();
});
