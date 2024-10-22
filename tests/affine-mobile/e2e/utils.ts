/* eslint-disable unicorn/prefer-dom-node-dataset */
import { expect, type Page } from '@playwright/test';

export async function expandCollapsibleSection(page: Page, name: string) {
  const divider = page.locator(`[data-collapsible]:has-text("${name}")`);
  if ((await divider.getAttribute('data-collapsed')) === 'true') {
    await divider.click();
  }
  await expect(divider).toHaveAttribute('data-collapsed', 'false');
  const section = divider.locator(
    '~ [data-testid="collapsible-section-content"]'
  );
  await expect(section).toBeVisible();
  return section;
}

/**
 * Click header "<" button
 */
export async function pageBack(page: Page) {
  await page.getByTestId('page-header-back').tap();
}
