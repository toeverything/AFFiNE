import { test } from '@affine-test/kit/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import {
  getBlockSuiteEditorTitle,
  waitMarkdownImported,
} from '../libs/page-logic';
import { clickSideBarAllPageButton } from '../libs/sidebar';

function getAllPage(page: Page) {
  const newPageButton = page
    .locator('table')
    .getByRole('button', { name: 'New Page' });
  const newPageDropdown = newPageButton.locator('svg');
  const edgelessBlockCard = page.locator('table').getByText('New Edgeless');

  async function clickNewPageButton() {
    return newPageButton.click();
  }

  async function clickNewEdgelessDropdown() {
    await newPageDropdown.click();
    await edgelessBlockCard.click();
  }
  return { clickNewPageButton, clickNewEdgelessDropdown };
}

test('all page', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await clickSideBarAllPageButton(page);
});

test('all page can create new page', async ({ page }) => {
  const { clickNewPageButton } = getAllPage(page);
  await openHomePage(page);
  await waitMarkdownImported(page);
  await clickSideBarAllPageButton(page);
  await clickNewPageButton();
  const title = getBlockSuiteEditorTitle(page);
  await title.fill('this is a new page');
  await clickSideBarAllPageButton(page);
  const cell = page.getByRole('cell', { name: 'this is a new page' });
  expect(cell).not.toBeUndefined();
});

test('all page can create new edgeless page', async ({ page }) => {
  const { clickNewEdgelessDropdown } = getAllPage(page);
  await openHomePage(page);
  await waitMarkdownImported(page);
  await clickSideBarAllPageButton(page);
  await clickNewEdgelessDropdown();
  await expect(page.locator('affine-edgeless-page')).toBeVisible();
});
