import userA from '@affine-test/fixtures/userA.json';
import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

test('server exist', async ({ page }) => {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('v-line');

  const json = await (await fetch('http://localhost:3010')).json();
  expect(json.message).toMatch(/^AFFiNE GraphQL server/);
});

test('login', async ({ page, context }) => {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('v-line');

  await page.getByText('Demo Workspace').click();
  await page.getByText('Sign in AFFiNE Cloud').click();
  await page.getByPlaceholder('torvalds@osdl.org').fill(userA.email);
  await page.getByLabel('Password').fill(userA.password);
  await page.getByText('Sign in with Password').click();
  await page.getByText('Demo Workspace').click();
  expect(
    (await context.cookies()).find(c => c.name === 'next-auth.session-token')
  ).toBeTruthy();
});
