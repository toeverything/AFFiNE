import type { Page } from '@playwright/test';

export async function newPage(page: Page) {
  return page.getByTestId('sliderBar').getByText('New Page').click();
}

export async function clickPageMoreActions(page: Page) {
  return page
    .getByTestId('editor-header-items')
    .getByRole('button')
    .nth(1)
    .click();
}
