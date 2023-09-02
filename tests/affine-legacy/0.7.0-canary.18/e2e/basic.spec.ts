import { resolve } from 'node:path';

import { test } from '@affine-test/kit/playwright';
import { newPage, waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import {
  check8080Available,
  setupProxyServer,
} from '@affine-test/kit/utils/proxy';
import { expect } from '@playwright/test';

const { switchToNext } = setupProxyServer(
  test,
  resolve(__dirname, '..', 'static')
);

test('init page', async ({ page, context }) => {
  await check8080Available(context);
  await page.goto('http://localhost:8081/');
  await waitForEditorLoad(page);
  await newPage(page);
  const locator = page.locator('v-line').nth(0);
  await locator.fill('hello');

  await switchToNext();
  await page.waitForTimeout(1000);
  await page.goto('http://localhost:8081/');
  await waitForEditorLoad(page);
  expect(await page.locator('v-line').nth(0).textContent()).toBe('hello');
});
