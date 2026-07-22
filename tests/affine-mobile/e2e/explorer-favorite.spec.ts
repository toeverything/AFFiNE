import { test } from '@affine-test/kit/mobile';
import { getBlockSuiteEditorTitle } from '@affine-test/kit/utils/page-logic';
import { getCurrentDocIdFromUrl } from '@affine-test/kit/utils/url';
import { expect } from '@playwright/test';

import {
  expandCollapsibleSection,
  openNavigationPanelNodeSwipeMenu,
  pageBack,
} from './utils';

test('Create new doc in favorites', async ({ page }) => {
  const section = await expandCollapsibleSection(page, 'favorites');
  const newButton = section.getByTestId(
    'navigation-panel-bar-add-favorite-button'
  );
  await newButton.tap();

  // const testTitleText = 'Test Favorited Doc';
  const title = getBlockSuiteEditorTitle(page);
  await expect(title).toBeVisible();
  // TODO(@CatsJuice): Mobile editor is not ready yet
  // await title.fill(testTitleText);
  const docId = getCurrentDocIdFromUrl(page);

  await pageBack(page);
  const section2 = await expandCollapsibleSection(page, 'favorites');
  const node = section2.getByTestId(`navigation-panel-doc-${docId}`);
  await expect(node).toBeVisible();

  await node.getByTestId('navigation-panel-collapsed-button').tap();
  await expect(
    page.getByTestId('navigation-panel-doc-add-linked-page')
  ).toBeVisible();

  await openNavigationPanelNodeSwipeMenu(page, node);
  const menu = page.getByRole('dialog');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('button', { name: 'Duplicate' })).toBeVisible();
  await expect(page.locator('#app-tabs')).toHaveCount(1);

  // const label = node.getByText(testTitleText);
  // await expect(label).toBeVisible();
});
