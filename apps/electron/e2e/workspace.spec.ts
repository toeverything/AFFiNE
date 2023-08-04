import path from 'node:path';

import { expect } from '@playwright/test';
import fs from 'fs-extra';

import { test } from './fixture';

test('check workspace has a DB file', async ({ appInfo, workspace }) => {
  const w = await workspace.current();
  const dbPath = path.join(
    appInfo.sessionData,
    'workspaces',
    w.id,
    'storage.db'
  );
  // check if db file exists
  expect(await fs.exists(dbPath)).toBe(true);
});

test.skip('move workspace db file', async ({ page, appInfo, workspace }) => {
  const w = await workspace.current();
  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await expect(page.getByTestId('setting-modal')).toBeVisible();

  // goto workspace setting
  await page.getByTestId('workspace-list-item').click();

  const tmpPath = path.join(appInfo.sessionData, w.id + '-tmp-dir');

  // move db file to tmp folder
  await page.evaluate(tmpPath => {
    // @ts-expect-error
    window.apis?.dialog.setFakeDialogResult({
      filePath: tmpPath,
    });
  }, tmpPath);

  await page.getByTestId('move-folder').click();
  // check if db file exists
  await page.waitForSelector('text="Move folder success"');
  expect(await fs.exists(tmpPath)).toBe(true);
  // check if db file exists under tmpPath (a file ends with .affine)
  const files = await fs.readdir(tmpPath);
  expect(files.some(f => f.endsWith('.affine'))).toBe(true);
});

test('export then add', async ({ page, appInfo, workspace }) => {
  const w = await workspace.current();

  await page.focus('.affine-doc-page-block-title');
  await page.fill('.affine-doc-page-block-title', 'test1');

  await page.getByTestId('slider-bar-workspace-setting-button').click();
  await expect(page.getByTestId('setting-modal')).toBeVisible();

  const originalId = w.id;

  const newWorkspaceName = 'new-test-name';

  // goto workspace setting
  await page.getByTestId('workspace-list-item').click();

  await page.waitForTimeout(500);

  // change workspace name
  await page.getByTestId('workspace-name-input').fill(newWorkspaceName);
  await page.getByTestId('save-workspace-name').click();
  await page.waitForSelector('text="Update workspace name success"');
  await page.waitForTimeout(500);

  const tmpPath = path.join(appInfo.sessionData, w.id + '-tmp.db');

  // export db file to tmp folder
  await page.evaluate(tmpPath => {
    // @ts-expect-error
    window.apis?.dialog.setFakeDialogResult({
      filePath: tmpPath,
    });
  }, tmpPath);

  await page.getByTestId('export-affine-backup').click();
  await page.waitForSelector('text="Export success"');

  expect(await fs.exists(tmpPath)).toBe(true);

  await page.getByTestId('modal-close-button').click();

  // add workspace
  // we are reusing the same db file so that we don't need to maintain one
  // in the codebase
  await page.getByTestId('current-workspace').click();
  await page.getByTestId('add-or-new-workspace').click();

  await page.evaluate(tmpPath => {
    // @ts-expect-error
    window.apis?.dialog.setFakeDialogResult({
      filePath: tmpPath,
    });
  }, tmpPath);

  // load the db file
  await page.getByTestId('add-workspace').click();

  // should show "Added Successfully" dialog
  await page.waitForSelector('text="Added Successfully"');
  await page.getByTestId('create-workspace-continue-button').click();

  // sleep for a while to wait for the workspace to be added :D
  await page.waitForTimeout(2000);
  const newWorkspace = await workspace.current();
  expect(newWorkspace.id).not.toBe(originalId);
  // check its name is correct
  await expect(page.getByTestId('workspace-name')).toHaveText(newWorkspaceName);

  // find button which has the title "test1"
  const test1PageButton = await page.waitForSelector(`text="test1"`);
  await test1PageButton.click();

  const title = page.locator('[data-block-is-title] >> text="test1"');
  await expect(title).toBeVisible();
});
