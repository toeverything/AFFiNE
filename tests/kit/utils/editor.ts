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
  await page.getByTestId('switch-page-mode-button').click({
    delay: 50,
  });
  await expect(
    page.locator('[data-testid="switch-page-mode-button"][data-active="true"]')
  ).toBeVisible();
}

export async function ensureInPageMode(page: Page) {
  await expect(
    page.locator('[data-testid="switch-page-mode-button"][data-active="true"]')
  ).toBeVisible();
}

export async function ensureInEdgelessMode(page: Page) {
  await expect(
    page.locator(
      '[data-testid="switch-edgeless-mode-button"][data-active="true"]'
    )
  ).toBeVisible();
}

export async function getPageMode(page: Page): Promise<'page' | 'edgeless'> {
  if (
    await page
      .locator('[data-testid="switch-page-mode-button"][data-active="true"]')
      .isVisible()
  ) {
    return 'page';
  }
  if (
    await page
      .locator(
        '[data-testid="switch-edgeless-mode-button"][data-active="true"]'
      )
      .isVisible()
  ) {
    return 'edgeless';
  }
  throw new Error('Unknown mode');
}
