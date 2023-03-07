import type { Page } from '@playwright/test';

export async function newPage(page: Page) {
  await page.waitForSelector('v-line');
  // fixme(himself65): if too fast, the page will crash
  await page.getByTestId('sliderBar').getByText('New Page').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
}

export function getBlockSuiteEditorTitle(page: Page) {
  return page.locator('v-line').nth(0);
}

export async function clickPageMoreActions(page: Page) {
  return page
    .getByTestId('editor-header-items')
    .getByTestId('editor-option-menu')
    .click();
}
