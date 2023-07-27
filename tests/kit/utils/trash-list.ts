import type { Page } from '@playwright/test';

export async function clickDeletePermanentlyButtonAndConfirm(
  page: Page,
  pageId: string
) {
  await page
    .getByTestId('more-actions-' + pageId)
    .getByRole('button')
    .nth(1)
    .click();
  await page
    .getByText(/Delete/g)
    .nth(1)
    .click();
}
