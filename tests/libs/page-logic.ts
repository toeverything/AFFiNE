import type { Page } from '@playwright/test';

export async function newPage(page: Page) {
  return page.getByTestId('sliderBar').getByText('New Page').click();
}

export async function clickPageMoreActions(page: Page) {
  return (
    page
      .getByTestId('editor-header-items')
      .getByRole('button')
      //FIXME: temporary change due to cloud sync icon being hidden
      .nth(1)
      .click()
  );
}
