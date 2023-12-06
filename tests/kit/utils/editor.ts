import type { Page } from '@playwright/test';

export async function clickEdgelessModeButton(page: Page) {
  await page.getByTestId('switch-edgeless-mode-button').click({
    delay: 50,
  });
}

export async function clickPageModeButton(page: Page) {
  return page.getByTestId('switch-page-mode-button').click({
    delay: 50,
  });
}
