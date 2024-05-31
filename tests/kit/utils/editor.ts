import { expect, type Page } from '@playwright/test';

export async function clickEdgelessModeButton(page: Page) {
  await page.getByTestId('switch-edgeless-mode-button').click({
    delay: 50,
  });
  await expect(
    page.locator(
      '[data-testid="switch-edgeless-mode-button"][data-active="true"]'
    )
  ).toBeVisible();
}

export async function clickPageModeButton(page: Page) {
  page.getByTestId('switch-page-mode-button').click({
    delay: 50,
  });
  await expect(
    page.locator('[data-testid="switch-page-mode-button"][data-active="true"]')
  ).toBeVisible();
}
