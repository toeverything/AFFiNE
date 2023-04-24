import { resolve } from 'node:path';

import { _electron as electron } from 'playwright';
import { expect, test } from 'vitest';

test('new page', async () => {
  const electronApp = await electron.launch({
    args: [resolve(__dirname, '../dist/layers/main/index.js')],
    executablePath: resolve(__dirname, '../node_modules/.bin/electron'),
    env: {
      ...(process.env as Record<string, string>),
    },
    colorScheme: 'light',
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

  // close app
  await electronApp.close();
});
