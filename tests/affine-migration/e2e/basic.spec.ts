import { patchDataEnhancement } from '@affine-test/kit/e2e-enhance/initializer';
import { SnapshotStorage } from '@affine-test/kit/e2e-enhance/snapshot';
import { clickEdgelessModeButton } from '@affine-test/kit/utils/editor';
import { coreUrl } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

async function open404PageToInitData(page: Page, version: string) {
  const snapshotStorage = new SnapshotStorage(version);
  const { binaries, idbData, localStorageData } = await snapshotStorage.read();

  // Open other page to init data
  await page.goto(`${coreUrl}/404`);
  await page.evaluate(
    ([v1, v2]) => window.writeAffineDatabase(v1, v2),
    [idbData, binaries]
  );
  await page.evaluate(
    value => window.writeAffineLocalStorage(value),
    localStorageData
  );

  return { localStorageData };
}

test.beforeEach(async ({ page }) => {
  await patchDataEnhancement(page);
});

test('v1 to v4', async ({ page }) => {
  await open404PageToInitData(page, '0.7.0-canary.18');

  await page.goto(coreUrl);
  await clickSideBarAllPageButton(page);
  await page.getByText('hello').click();

  //#region fixme(himself65): blocksuite issue, data cannot be loaded to store
  const url = page.url();
  await page.waitForTimeout(5000);
  await page.goto(url);
  //#endregion

  await waitForEditorLoad(page);
  expect(await page.locator('v-line').nth(0).textContent()).toBe('hello');

  const changedLocalStorageData = await page.evaluate(() =>
    window.readAffineLocalStorage()
  );
  const workspaces = JSON.parse(
    changedLocalStorageData['jotai-workspaces']
  ) as any[];
  for (const workspace of workspaces) {
    expect(workspace.version).toBe(4);
  }
});

test('v2 to v4, database migration', async ({ page }) => {
  const { localStorageData } = await open404PageToInitData(
    page,
    '0.8.0-canary.7'
  );

  //#region fixme(himself65): blocksuite issue, data cannot be loaded to store
  const allPagePath = `${coreUrl}/workspace/${localStorageData.last_workspace_id}/all`;
  await page.goto(allPagePath);
  await page.waitForTimeout(5000);
  //#endregion

  const detailPagePath = `${coreUrl}/workspace/${localStorageData.last_workspace_id}/${localStorageData.last_page_id}`;
  await page.goto(detailPagePath);
  await waitForEditorLoad(page);

  // check page mode is correct
  expect(await page.locator('v-line').nth(0).textContent()).toBe('hello');
  expect(await page.locator('affine-database').isVisible()).toBe(true);

  // check edgeless mode is correct
  await clickEdgelessModeButton(page);
  await page.waitForTimeout(200);
  expect(await page.locator('affine-database').isVisible()).toBe(true);

  const changedLocalStorageData = await page.evaluate(() =>
    window.readAffineLocalStorage()
  );
  const workspaces = JSON.parse(
    changedLocalStorageData['jotai-workspaces']
  ) as any[];
  for (const workspace of workspaces) {
    expect(workspace.version).toBe(4);
  }
});

test('v3 to v4, surface migration', async ({ page }) => {
  const { localStorageData } = await open404PageToInitData(page, '0.8.4');

  //#region fixme(himself65): blocksuite issue, data cannot be loaded to store
  const allPagePath = `${coreUrl}/workspace/${localStorageData.last_workspace_id}/all`;
  await page.goto(allPagePath);
  await page.waitForTimeout(5000);
  //#endregion

  const detailPagePath = `${coreUrl}/workspace/${localStorageData.last_workspace_id}/${localStorageData.last_page_id}`;
  await page.goto(detailPagePath);
  await waitForEditorLoad(page);

  // check edgeless mode is correct
  await clickEdgelessModeButton(page);
  await expect(page.locator('edgeless-toolbar')).toBeVisible();
  await expect(page.locator('affine-edgeless-page')).toBeVisible();

  const changedLocalStorageData = await page.evaluate(() =>
    window.readAffineLocalStorage()
  );
  const workspaces = JSON.parse(
    changedLocalStorageData['jotai-workspaces']
  ) as any[];
  for (const workspace of workspaces) {
    expect(workspace.version).toBe(4);
  }
});

test('v0 to v4, subdoc migration', async ({ page }) => {
  await open404PageToInitData(page, '0.6.1-beta.1');

  await page.goto(coreUrl);
  await page.waitForTimeout(5000);

  // go to all page
  await clickSideBarAllPageButton(page);

  // find if page name with "hello" exists and click it
  await page
    .locator('[data-testid="page-list-item-title-text"]:has-text("hello")')
    .click();

  await waitForEditorLoad(page);

  // check if content is correct
  expect(await page.locator('v-line').nth(0).textContent()).toBe('hello');
  expect(await page.locator('v-line').nth(1).textContent()).toBe(
    'TEST CONTENT'
  );

  // check edgeless mode is correct
  await clickEdgelessModeButton(page);
  await expect(page.locator('edgeless-toolbar')).toBeVisible();
  await expect(page.locator('affine-edgeless-page')).toBeVisible();

  const changedLocalStorageData = await page.evaluate(() =>
    window.readAffineLocalStorage()
  );
  const workspaces = JSON.parse(
    changedLocalStorageData['jotai-workspaces']
  ) as any[];
  for (const workspace of workspaces) {
    expect(workspace.version).toBe(4);
  }
});
