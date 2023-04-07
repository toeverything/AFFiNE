import { resolve } from 'node:path';

import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('open page', async () => {
  const electronApp = await electron.launch({
    args: ['.'],
    executablePath: resolve(__dirname, '../node_modules/.bin/electron'),
    colorScheme: 'light',
  });
  const isPackaged = await electronApp.evaluate(async ({ app }) => {
    return app.isPackaged;
  });

  expect(isPackaged).toBe(false);

  const window = await electronApp.firstWindow();
  await window.evaluate(() => localStorage.clear());
  await window.reload();
  await window.evaluate(
    () =>
      new Promise(resolve => {
        document.addEventListener('markdown:imported', resolve);
      })
  );
  // @ts-expect-error
  const flavour = await window.evaluate(
    () => globalThis.currentWorkspace.flavour
  );
  expect(flavour).toBe('local');

  // close app
  await electronApp.close();
});
