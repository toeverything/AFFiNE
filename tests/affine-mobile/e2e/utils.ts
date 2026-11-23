import { expect, type Locator, type Page } from '@playwright/test';

export async function expandCollapsibleSection(page: Page, name: string) {
  const divider = page.locator(`[data-collapsible]:has-text("${name}")`);
  await divider.waitFor({ state: 'visible' });
  // oxlint-disable-next-line prefer-dom-node-dataset
  if ((await divider.getAttribute('data-collapsed')) === 'true') {
    if ((await divider.getAttribute('role')) === 'switch') {
      await divider.click();
    } else {
      await divider.getByRole('button').click();
    }
  }
  await expect(divider).toHaveAttribute('data-collapsed', 'false');
  const section = divider.locator(
    '~ [data-testid="collapsible-section-content"]'
  );
  if ((await section.count()) > 0) {
    await expect(section).toBeVisible();
    return section;
  }
  return page.locator('body');
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

export async function openNavigationPanelNodeSwipeMenu(
  page: Page,
  node: Locator
) {
  if (page.context().browser()?.browserType().name() !== 'chromium') {
    await node
      .getByTestId('swipe-menu-trigger')
      .evaluate(button =>
        button.dispatchEvent(
          new MouseEvent('click', { bubbles: true, cancelable: true })
        )
      );
    return;
  }

  const box = await node.boundingBox();
  if (!box) throw new Error('Navigation row is not visible');
  const session = await page.context().newCDPSession(page);
  try {
    const y = box.y + box.height / 2;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + box.width - 20, y }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: box.x, y }],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
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
