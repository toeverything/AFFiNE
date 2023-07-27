import type { Page } from '@playwright/test';

export async function clickMoreActionsButton(page: Page, pageId: string) {
  await page
    .getByTestId('more-actions-' + pageId)
    .getByRole('button')
    .first()
    .click();
}

export async function clickMoveToTrashButtonAndConfirm(page: Page) {
  await page.getByTestId('move-to-trash').click();
  await page.getByRole('button', { name: 'Delete' }).click();
}
