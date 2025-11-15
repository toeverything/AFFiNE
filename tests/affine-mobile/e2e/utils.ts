import { expect, type Locator, type Page } from '@playwright/test';

export async function expandCollapsibleSection(page: Page, name: string) {
  const divider = page.locator(`[data-collapsible]:has-text("${name}")`);
  // oxlint-disable-next-line prefer-dom-node-dataset
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

export async function getAttrOfActiveElement(
  page: Page,
  attrName = 'data-testid'
) {
  return await page.evaluate(name => {
    const el = document.activeElement;
    return el ? el.getAttribute(name) : '';
  }, attrName);
}

/**
 * Open the context menu of an navigation panel node
 * @returns Menu Locator
 */
export async function openNavigationPanelNodeMenu(page: Page, node: Locator) {
  await node.getByTestId('menu-trigger').tap();
  const menu = page.getByRole('dialog');
  await expect(menu).toBeVisible();
  return menu;
}

export async function openTab(
  page: Page,
  name: 'home' | 'all' | 'Journal' | 'New Page'
) {
  const tab = page.locator('#app-tabs').getByRole('tab', { name });
  await expect(tab).toBeVisible();
  await tab.click();

  // oxlint-disable-next-line prefer-dom-node-dataset
  const isActive = await tab.getAttribute('data-active');
  expect(isActive).toBe('true');
}
