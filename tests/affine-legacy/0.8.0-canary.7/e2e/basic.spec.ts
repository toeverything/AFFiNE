import { patchDataEnhancement } from '@affine-test/kit/e2e-enhance/initializer';
import { SnapshotStorage } from '@affine-test/kit/e2e-enhance/snapshot';
import { test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await patchDataEnhancement(page);
});

test('record 0.8.0-canary.7 database legacy data', async ({ page }) => {
  await page.goto('http://localhost:8081/');
  await page.waitForSelector('v-line', {
    timeout: 10000,
  });
  await page.getByTestId('new-page-button').click();
  const title = page.locator('.affine-default-page-block-title');
  await title.pressSequentially('hello');
  await page.keyboard.press('Enter', { delay: 50 });
  await page.keyboard.press('/', { delay: 50 });
  await page.keyboard.press('d');
  await page.keyboard.press('a');
  await page.keyboard.press('t');
  await page.keyboard.press('a');
  await page.keyboard.press('b');
  await page.keyboard.press('a', { delay: 50 });
  await page.keyboard.press('Enter', { delay: 50 });

  const localStorageData = await page.evaluate(() =>
    window.readAffineLocalStorage()
  );
  const { idbData, binaries } = await page.evaluate(() =>
    window.readAffineDatabase()
  );

  const snapshotStorage = new SnapshotStorage('0.8.0-canary.7');
  await snapshotStorage.write({
    idbData,
    localStorageData,
    binaries,
  });
});
