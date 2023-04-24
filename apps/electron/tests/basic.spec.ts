import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('new page', async () => {
  const electronApp = await electron.launch({
    args: ['.'],
    env: {
      ...(process.env as Record<string, string>),
    },
    executablePath: resolve(__dirname, '../node_modules/.bin/electron'),
    colorScheme: 'light',
  });
  const isPackaged = await electronApp.evaluate(async ({ app }) => {
    return app.isPackaged;
  });

  expect(isPackaged).toBe(false);

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

  // close app
  await electronApp.close();
});
