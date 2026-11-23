import { test } from '@affine-test/kit/mobile';
import { expect } from '@playwright/test';

import {
  expandCollapsibleSection,
  openNavigationPanelNodeMenu,
  pageBack,
} from './utils';

test('collection menu does not offer an edit action', async ({ page }) => {
  const name = 'Test Collection';
  const section = await expandCollapsibleSection(page, 'collections');
  await section.getByTestId('navigation-panel-bar-add-collection-button').tap();
  await page.getByTestId('prompt-modal-input').fill(name);
  await page.getByTestId('prompt-modal-confirm').tap();
  await pageBack(page);

  const collection = section.locator(
    `[data-role="navigation-panel-collection"][aria-label="${name}"]`
  );
  await expect(collection).toBeVisible();

  const menu = await openNavigationPanelNodeMenu(page, collection);
  await expect(menu.getByText('Delete')).toBeVisible();
  await expect(menu.getByText('Edit collection')).toHaveCount(0);
});
