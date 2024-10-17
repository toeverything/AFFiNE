import { patchDataEnhancement } from '@affine-test/kit/e2e-enhance/initializer';
import { LegacySnapshotStorage } from '@affine-test/kit/e2e-enhance/snapshot';
import { test } from '@affine-test/kit/playwright';
import { clickEdgelessModeButton } from '@affine-test/kit/utils/editor';
import { coreUrl } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

async function open404PageToInitData(page: Page, version: string) {
  const snapshotStorage = new LegacySnapshotStorage(version);
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

  await expect(page.getByTestId('upgrade-workspace-button')).toBeVisible();
  await page.getByTestId('upgrade-workspace-button').click();

  await expect(page.getByTestId('page-list-item')).toHaveCount(2);
  await page
    .getByTestId('page-list-item-title-text')
    .getByText('hello')
    .click();

  await waitForEditorLoad(page);
  await expect(page.locator('v-line').nth(0)).toHaveText('hello');
});

test('v2 to v4, database migration', async ({ page }) => {
  const { localStorageData } = await open404PageToInitData(
    page,
    '0.8.0-canary.7'
  );

  const detailPagePath = `${coreUrl}/workspace/${localStorageData.last_workspace_id}/${localStorageData.last_page_id}`;
  await page.goto(detailPagePath);

  await expect(page.getByTestId('upgrade-workspace-button')).toBeVisible();
  await page.getByTestId('upgrade-workspace-button').click();

  // check page mode is correct
  await expect(page.locator('v-line').nth(0)).toHaveText('hello');
  await expect(page.locator('affine-database')).toBeVisible();

  // check edgeless mode is correct
  await clickEdgelessModeButton(page);
  await expect(page.locator('affine-database')).toBeVisible();
});

test('v3 to v4, surface migration', async ({ page }) => {
  const { localStorageData } = await open404PageToInitData(page, '0.8.4');

  const detailPagePath = `${coreUrl}/workspace/${localStorageData.last_workspace_id}/${localStorageData.last_page_id}`;
  await page.goto(detailPagePath);

  await expect(page.getByTestId('upgrade-workspace-button')).toBeVisible();
  await page.getByTestId('upgrade-workspace-button').click();
  await waitForEditorLoad(page);

  await page.waitForTimeout(500);

  // check edgeless mode is correct
  await clickEdgelessModeButton(page);
  await expect(page.locator('.edgeless-toolbar-container')).toBeVisible();
  await expect(page.locator('affine-edgeless-root')).toBeVisible();
});

test('v0 to v4, subdoc migration', async ({ page }) => {
  await open404PageToInitData(page, '0.6.1-beta.1');

  await page.goto(coreUrl);
  await clickSideBarAllPageButton(page);

  await expect(page.getByTestId('upgrade-workspace-button')).toBeVisible();
  await page.getByTestId('upgrade-workspace-button').click();

  await expect(page.getByTestId('page-list-item')).toHaveCount(2);
  await page
    .getByTestId('page-list-item-title-text')
    .getByText('hello')
    .click();

  await waitForEditorLoad(page);

  // check page mode is correct
  await expect(page.locator('v-line').nth(0)).toHaveText('hello');
  await expect(page.locator('v-line').nth(1)).toHaveText('TEST CONTENT');

  // check edgeless mode is correct
  await clickEdgelessModeButton(page);
  await expect(page.locator('.edgeless-toolbar-container')).toBeVisible();
  await expect(page.locator('affine-edgeless-root')).toBeVisible();
});
