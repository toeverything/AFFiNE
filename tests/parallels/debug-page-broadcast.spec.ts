import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

test('should broadcast a message to all debug pages', async ({
  page,
  context,
}) => {
  await page.goto('http://localhost:8080/_debug/broadcast');
  const page2 = await context.newPage();
  await page2.goto('http://localhost:8080/_debug/broadcast');
  await page.waitForSelector('#__next');
  await page2.waitForSelector('#__next');
  await page.click('[data-testid="create-page"]');
  expect(await page.locator('tr').count()).toBe(3);
  expect(await page2.locator('tr').count()).toBe(3);
  await page2.click('[data-testid="create-page"]');
  expect(await page.locator('tr').count()).toBe(4);
  expect(await page2.locator('tr').count()).toBe(4);
});
