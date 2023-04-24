import { fileURLToPath } from 'node:url';

import type { ElectronApplication } from 'playwright';
import { _electron as electron } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';
let electronApp: ElectronApplication;

beforeAll(async () => {
  electronApp = await electron.launch({
    args: [
      fileURLToPath(new URL('../dist/layers/main/index.js', import.meta.url)),
    ],
    executablePath: fileURLToPath(
      new URL('../node_modules/.bin/electron', import.meta.url)
    ),
  });
});

afterAll(async () => {
  await electronApp.close();
});

test('new page', async () => {
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
}, 30_000);
