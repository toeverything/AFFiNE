import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { clickPageMoreActions, waitMarkdownImported } from '../libs/page-logic';
import { test } from '../libs/playwright';

test.describe('Change page mode(Page or Edgeless)', () => {
  test('Switch to edgeless by switch edgeless item', async ({ page }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
    const btn = await page.getByTestId('switch-edgeless-mode-button');
    await btn.click();

    const edgeless = page.locator('affine-edgeless-page');
    expect(await edgeless.isVisible()).toBe(true);
  });

  test('Convert to edgeless by editor header items', async ({ page }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
    await clickPageMoreActions(page);
    const menusEdgelessItem = page.getByTestId('editor-option-menu-edgeless');
    await menusEdgelessItem.click({ delay: 100 });

    const edgeless = page.locator('affine-edgeless-page');
    expect(await edgeless.isVisible()).toBe(true);
  });
});
