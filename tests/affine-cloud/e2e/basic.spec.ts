import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

test('server exist', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('v-line');

  const json = await (await fetch('http://localhost:3010')).json();
  expect(json.message).toMatch(/^AFFiNE GraphQL server/);
});
