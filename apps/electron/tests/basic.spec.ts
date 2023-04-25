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
