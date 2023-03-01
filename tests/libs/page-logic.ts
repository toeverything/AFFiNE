import type { Page } from '@playwright/test';

export async function newPage(page: Page) {
  // fixme(himself65): if too fast, the page will crash
  await page.getByTestId('sliderBar').getByText('New Page').click({
    delay: 100,
  });
  await page.waitForTimeout(100);
}

export async function clickPageMoreActions(page: Page) {
  return page
    .getByTestId('editor-header-items')
    .getByTestId('editor-option-menu')
    .click();
}
