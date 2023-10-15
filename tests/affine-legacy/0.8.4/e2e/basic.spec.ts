import { patchDataEnhancement } from '@affine-test/kit/e2e-enhance/initializer';
import { SnapshotStorage } from '@affine-test/kit/e2e-enhance/snapshot';
import { getBlockSuiteEditorTitle } from '@affine-test/kit/utils/page-logic';
import { test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await patchDataEnhancement(page);
});

test('record 0.8.4 surface legacy data', async ({ page }) => {
  await page.goto('http://localhost:8081/');
  await page.waitForSelector('v-line', {
    timeout: 10000,
  });
  await page.getByTestId('new-page-button').click();
  const title = getBlockSuiteEditorTitle(page);
  await title.pressSequentially('hello');
  await page.keyboard.press('Enter', { delay: 50 });
  await page.keyboard.type('world', {
    delay: 50,
  });
  await page.getByTestId('switch-edgeless-mode-button').click({
    delay: 50,
  });

  await page
    .locator('edgeless-toolbar edgeless-toolbar-button')
    .filter({
      hasText: 'Pen',
    })
    .click({
      delay: 50,
    });
  await page.mouse.move(500, 500);
  await page.mouse.down();
  await page.mouse.move(500, 600, {
    steps: 10,
  });
  await page.mouse.up();

  const localStorageData = await page.evaluate(() =>
    window.readAffineLocalStorage()
  );
  const { idbData, binaries } = await page.evaluate(() =>
    window.readAffineDatabase()
  );

  const snapshotStorage = new SnapshotStorage('0.8.4');
  await snapshotStorage.write({
    idbData,
    localStorageData,
    binaries,
  });
});
