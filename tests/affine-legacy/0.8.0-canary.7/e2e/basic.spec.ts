import { resolve } from 'node:path';

import { clickEdgelessModeButton } from '@affine-test/kit/utils/editor';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import {
  check8080Available,
  setupProxyServer,
} from '@affine-test/kit/utils/proxy';
import { expect, test } from '@playwright/test';

const { switchToNext } = setupProxyServer(
  test,
  resolve(__dirname, '..', 'static')
);

test('database migration', async ({ page, context }) => {
  await check8080Available(context);
  await page.goto('http://localhost:8081/');
  await page.waitForSelector('v-line', {
    timeout: 10000,
  });
  await page.getByTestId('new-page-button').click();
  const title = page.locator('.affine-default-page-block-title');
  await title.type('hello');
  await page.keyboard.press('Enter', { delay: 50 });
  await page.keyboard.press('/', { delay: 50 });
  await page.keyboard.press('d');
  await page.keyboard.press('a');
  await page.keyboard.press('t');
  await page.keyboard.press('a');
  await page.keyboard.press('b');
  await page.keyboard.press('a', { delay: 50 });
  await page.keyboard.press('Enter', { delay: 50 });

  await switchToNext();
  await page.waitForTimeout(1000);
  await page.goto('http://localhost:8081/');
  await page.click('text=hello');
  await waitForEditorLoad(page);
  // check page mode is correct
  expect(await page.locator('v-line').nth(0).textContent()).toBe('hello');
  expect(await page.locator('affine-database').isVisible()).toBe(true);

  // check edgeless mode is correct
  await page.getByTestId('switch-edgeless-mode-button').click();
  await clickEdgelessModeButton(page);
  await page.waitForTimeout(200);
  expect(await page.locator('affine-database').isVisible()).toBe(true);
});
