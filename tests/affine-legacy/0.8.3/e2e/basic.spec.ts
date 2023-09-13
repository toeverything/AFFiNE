import { resolve } from 'node:path';

import { clickEdgelessModeButton } from '@affine-test/kit/utils/editor';
import {
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import {
  check8080Available,
  setupProxyServer,
} from '@affine-test/kit/utils/proxy';
import { expect, test } from '@playwright/test';

const { switchToNext } = setupProxyServer(
  test,
  resolve(__dirname, '..', 'static')
);

test('surface migration', async ({ page, context }) => {
  await check8080Available(context);
  await page.goto('http://localhost:8081/');
  await page.waitForSelector('v-line', {
    timeout: 10000,
  });
  await page.getByTestId('new-page-button').click();
  const title = getBlockSuiteEditorTitle(page);
  await title.type('hello');
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
  const url = page.url();

  await switchToNext();
  await page.waitForTimeout(1000);
  await page.goto(url);
  await waitForEditorLoad(page);

  // check edgeless mode is correct
  await clickEdgelessModeButton(page);
  await expect(page.locator('edgeless-toolbar')).toBeVisible();
  await expect(page.locator('affine-edgeless-page')).toBeVisible();
});
