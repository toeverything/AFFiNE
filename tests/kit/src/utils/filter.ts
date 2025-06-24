import type { Page } from '@playwright/test';

// fixme: there could be multiple page lists in the Page
export const getPagesCount = async (page: Page) => {
  const locator = page.locator('[data-testid="doc-list-item"]');
  return await locator.count();
};

export async function selectTag(page: Page, name: string | RegExp) {
  await page.getByTestId('filter-arg').click();
  await page.getByTestId(`multi-select-${name}`).click();
  await page.keyboard.press('Escape', { delay: 100 });
}
