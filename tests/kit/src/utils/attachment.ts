import type { Page } from '@playwright/test';

import { Path } from '../playwright';

const fixturesDir = Path.dir(import.meta.url).join('../../../fixtures');

export async function importFile(
  page: Page,
  file: string,
  fn?: (page: Page) => Promise<void>
) {
  await page.evaluate(() => {
    // Force fallback to input[type=file] in tests
    // See https://github.com/microsoft/playwright/issues/8850
    window.showOpenFilePicker = undefined;
  });

  const fileChooser = page.waitForEvent('filechooser');

  if (fn) await fn(page);

  await (await fileChooser).setFiles(fixturesDir.join(file).value);
}

export async function importAttachment(page: Page, file: string) {
  // open slash menu
  await importFile(page, file, async page => {
    await page.keyboard.type('/attachment', { delay: 50 });
    await page.keyboard.press('Enter');
  });
}
