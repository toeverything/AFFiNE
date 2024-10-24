import { patchDataEnhancement } from '@affine-test/kit/e2e-enhance/initializer';
import { LegacySnapshotStorage } from '@affine-test/kit/e2e-enhance/snapshot';
import { test } from '@affine-test/kit/playwright';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';

test.beforeEach(async ({ page }) => {
  await patchDataEnhancement(page);
});

test('record 0.7.0-canary.18 legacy data', async ({ page }) => {
  await page.goto('http://localhost:8081/');
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  const locator = page.locator('v-line').nth(0);
  await locator.fill('hello');

  const localStorageData = await page.evaluate(() =>
    window.readAffineLocalStorage()
  );
  const { idbData, binaries } = await page.evaluate(() =>
    window.readAffineDatabase()
  );

  const snapshotStorage = new LegacySnapshotStorage('0.7.0-canary.18');
  await snapshotStorage.write({
    idbData,
    localStorageData,
    binaries,
  });
});
