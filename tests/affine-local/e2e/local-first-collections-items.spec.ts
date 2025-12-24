import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  getPageByTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import {
  clickSideBarAllPageButton,
  clickSideBarCurrentWorkspaceBanner,
} from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const removeOnboardingPages = async (page: Page) => {
  await page.getByTestId('all-pages').click();
  await page
    .getByTestId('doc-list-item')
    .first()
    .click({
      modifiers: ['Shift'],
    });
  await page
    .getByTestId('doc-list-item')
    .last()
    .click({
      modifiers: ['Shift'],
    });
  await page.getByTestId('list-toolbar-delete').click();
  // confirm delete
  await page.getByTestId('confirm-modal-confirm').click();
};

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
});

const createAndPinCollection = async (
  page: Page,
  options?: {
    collectionName?: string;
  }
) => {
  await page.getByTestId('all-pages').click();

  await page.getByTestId('navigation-panel-bar-add-collection-button').click();
  const title = page.getByTestId('prompt-modal-input');
  await expect(title).toBeVisible();
  await title.fill(options?.collectionName ?? 'test collection');
  await page.getByTestId('prompt-modal-confirm').click();
  await page.waitForTimeout(100);
  await page
    .locator('[data-testid^="navigation-panel-collection-"]')
    .first()
    .click();
  await page.getByTestId('collection-add-doc-button').click();
  await page.getByTestId('confirm-modal-confirm').click();

  // fixme: remove this timeout. looks like an issue with useBindWorkbenchToBrowserRouter?
  await page.waitForTimeout(500);

  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('test page');

  await page.getByTestId('all-pages').click();

  const cell = page.getByTestId('doc-list-item-title').getByText('test page');
  await expect(cell).toBeVisible();
};

test('Show collections items in sidebar', async ({ page }) => {
  await removeOnboardingPages(page);
  await createAndPinCollection(page);
  const collections = page.getByTestId('navigation-panel-collections');
  const items = collections.locator(
    '[data-testid^="navigation-panel-collection-"]'
  );
  await expect(items).toHaveCount(1);
  const first = items.first();
  expect((await first.textContent())!.startsWith('test collection')).toBe(true);
  const collectionPage = first
    .locator('[data-testid^="navigation-panel-doc-"]')
    .nth(0);
  expect(await collectionPage.textContent()).toBe('test page');
  await collectionPage.hover();
  await collectionPage
    .getByTestId('navigation-panel-tree-node-operation-button')
    .click();
  const deletePage = page.getByText('Move to trash');
  await deletePage.click();
  await page.getByTestId('confirm-modal-confirm').click();
  await expect(
    first.locator('[data-testid^="navigation-panel-doc-"]')
  ).toHaveCount(0);
  // position is a workaround for the hover issue when empty collection status's height > 26px (will cause scroll)
  await first.hover({ position: { x: 10, y: 10 } });
  await first
    .getByTestId('navigation-panel-tree-node-operation-button')
    .click();
  const deleteCollection = page.getByText('Delete');
  await deleteCollection.click();
  await page.waitForTimeout(50);
  await expect(items).toHaveCount(0);
  await createAndPinCollection(page);
  await expect(items).toHaveCount(1);
  await clickSideBarAllPageButton(page);
  await createLocalWorkspace(
    {
      name: 'Test 1',
    },
    page
  );
  await waitForEditorLoad(page);
  await expect(items).toHaveCount(0);
  await clickSideBarCurrentWorkspaceBanner(page);
  await page.getByTestId('workspace-card').nth(0).click();
});

test('edit collection', async ({ page }) => {
  await removeOnboardingPages(page);
  await createAndPinCollection(page);
  const collections = page.getByTestId('navigation-panel-collections');
  const items = collections.locator(
    '[data-testid^="navigation-panel-collection-"]'
  );
  await expect(items).toHaveCount(1);
  const first = items.first();
  await first.getByTestId('navigation-panel-collapsed-button').first().click();
  await first.hover();
  await first
    .getByTestId('navigation-panel-tree-node-operation-button')
    .click();
  const editCollection = page.getByText('Rename');
  await editCollection.click();
  await page.getByTestId('rename-modal-input').fill('123');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  expect(await first.textContent()).toBe('123');
});

test('add collection from sidebar', async ({ page }) => {
  await removeOnboardingPages(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('test page');
  await page.getByTestId('all-pages').click();
  const cell = await getPageByTitle(page, 'test page');
  await expect(cell).toBeVisible();
  await page
    .getByTestId('navigation-panel-collections')
    .getByTestId('category-divider-collapse-button')
    .click();
  const nullCollection = page.getByTestId(
    'slider-bar-collection-empty-message'
  );
  await expect(nullCollection).toBeVisible();
  await page.getByTestId('navigation-panel-bar-add-collection-button').click();
  const title = page.getByTestId('prompt-modal-input');
  await expect(title).toBeVisible();
  await title.fill('test collection');
  await page.getByTestId('prompt-modal-confirm').click();
  await page.waitForTimeout(100);
  const collections = page.getByTestId('navigation-panel-collections');
  const items = collections.locator(
    '[data-testid^="navigation-panel-collection-"]'
  );
  await expect(items).toHaveCount(1);
  await expect(nullCollection).not.toBeVisible();
});
