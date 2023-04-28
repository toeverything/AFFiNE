import { resolve } from 'node:path';

import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('new page', async () => {
  const electronApp = await electron.launch({
    args: [resolve(__dirname, '..')],
    executablePath: resolve(__dirname, '../node_modules/.bin/electron'),
  });
  const page = await electronApp.firstWindow();
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
  const flavour = await page.evaluate(
    // @ts-expect-error
    () => globalThis.currentWorkspace.flavour
  );
  expect(flavour).toBe('local');
  await electronApp.close();
});

test('affine cloud disabled', async () => {
  const electronApp = await electron.launch({
    args: [resolve(__dirname, '..')],
    executablePath: resolve(__dirname, '../node_modules/.bin/electron'),
  });
  const page = await electronApp.firstWindow();
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
  await page.getByTestId('current-workspace').click();
  await page.getByTestId('sign-in-button').click();
  await page.getByTestId('disable-affine-cloud-modal').waitFor({
    state: 'visible',
  });
  await electronApp.close();
});
