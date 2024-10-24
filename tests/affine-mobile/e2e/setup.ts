import path from 'node:path';

import { patchDataEnhancement } from '@affine-test/kit/e2e-enhance/initializer';
import { SnapshotStorage } from '@affine-test/kit/e2e-enhance/snapshot';
import { expect, type Page, test as setup } from '@playwright/test';

const stateDir = path.join(__dirname, '../.state');

async function persistState(page: Page) {
  const { idbData, binaries } = await page.evaluate(() =>
    window.readAffineDatabase()
  );
  const localStorageData = await page.evaluate(() =>
    window.readAffineLocalStorage()
  );
  const snapshotStorage = new SnapshotStorage(stateDir);
  await snapshotStorage.write({
    idbData,
    binaries,
    localStorageData,
  });
}

export async function loadState(page: Page) {
  // patchDataEnhancement must be called before this
  const snapshotStorage = new SnapshotStorage(stateDir);
  const { idbData, binaries, localStorageData } = await snapshotStorage.read();

  await page.evaluate(
    async ({ idbData, binaries, localStorageData }) => {
      await window.writeAffineDatabase(idbData, binaries);
      await window.writeAffineLocalStorage(localStorageData);
    },
    { idbData, binaries, localStorageData }
  );
}

setup('prepare (create first workspace)', async ({ page }) => {
  await patchDataEnhancement(page);
  await page.goto('/');
  await expect(
    page.locator('.affine-page-viewport[data-mode="edgeless"]')
  ).toBeVisible({
    timeout: 30 * 1000,
  });
  await persistState(page);
});
