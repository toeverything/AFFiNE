import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
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
  await page.getByTestId('page-list-header-selection-checkbox').click();
  // click again to select all
  await page.getByTestId('page-list-header-selection-checkbox').click();
  await page.getByTestId('list-toolbar-delete').click();
  // confirm delete
  await page.getByTestId('confirm-delete-page').click();
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
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('test page');

  // fixme: remove this timeout. looks like an issue with useBindWorkbenchToBrowserRouter?
  await page.waitForTimeout(500);

  await page.getByTestId('all-pages').click();

  const cell = page.getByTestId('page-list-item-title').getByText('test page');
  await expect(cell).toBeVisible();
  await page.getByTestId('create-first-filter').click({
    delay: 200,
  });
  await page
    .getByTestId('variable-select')
    .getByTestId(`filler-tag-Created`)
    .click({
      delay: 200,
    });
  await page.getByTestId('save-as-collection').click({
    delay: 200,
  });
  const title = page.getByTestId('input-collection-title');
  await expect(title).toBeVisible();
  await title.fill(options?.collectionName ?? 'test collection');
  await page.getByTestId('save-collection').click();
  await page.waitForTimeout(100);
};

test('Show collections items in sidebar', async ({ page }) => {
  await removeOnboardingPages(page);
  await createAndPinCollection(page);
  const collections = page.getByTestId('explorer-collections');
  await collections.getByTestId('category-divider-collapse-button').click();
  const items = collections.locator('[data-testid^="explorer-collection-"]');
  await expect(items).toHaveCount(1);
  const first = items.first();
  expect(await first.textContent()).toBe('test collection');
  await first.getByTestId('explorer-collapsed-button').click();
  const collectionPage = first.locator('[data-testid^="explorer-doc-"]').nth(0);
  expect(await collectionPage.textContent()).toBe('test page');
  await collectionPage.hover();
  await collectionPage
    .getByTestId('explorer-tree-node-operation-button')
    .click();
  const deletePage = page.getByText('Move to trash');
  await deletePage.click();
  await page.getByTestId('confirm-modal-confirm').click();
  expect(await first.locator('[data-testid^="explorer-doc-"]').count()).toBe(0);
  // position is a workaround for the hover issue when empty collection status's height > 26px (will cause scroll)
  await first.hover({ position: { x: 10, y: 10 } });
  await first.getByTestId('explorer-tree-node-operation-button').click();
  const deleteCollection = page.getByText('Delete');
  await deleteCollection.click();
  await page.waitForTimeout(50);
  await expect(items).toHaveCount(0);
  await createAndPinCollection(page);
  expect(await items.count()).toBe(1);
  await clickSideBarAllPageButton(page);
  await createLocalWorkspace(
    {
      name: 'Test 1',
    },
    page
  );
  await waitForEditorLoad(page);
  expect(await items.count()).toBe(0);
  await clickSideBarCurrentWorkspaceBanner(page);
  await page.getByTestId('workspace-card').nth(0).click();
});

test('edit collection', async ({ page }) => {
  await removeOnboardingPages(page);
  await createAndPinCollection(page);
  const collections = page.getByTestId('explorer-collections');
  await collections.getByTestId('category-divider-collapse-button').click();
  const items = collections.locator('[data-testid^="explorer-collection-"]');
  expect(await items.count()).toBe(1);
  const first = items.first();
  await first.hover();
  await first.getByTestId('explorer-tree-node-operation-button').click();
  const editCollection = page.getByText('Rename');
  await editCollection.click();
  await page.getByTestId('rename-modal-input').fill('123');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  expect(await first.textContent()).toBe('123');
});

test('edit collection and change filter date', async ({ page }) => {
  await removeOnboardingPages(page);
  await createAndPinCollection(page);
  const collections = page.getByTestId('explorer-collections');
  await collections.getByTestId('category-divider-collapse-button').click();
  const items = collections.locator('[data-testid^="explorer-collection-"]');
  expect(await items.count()).toBe(1);
  const first = items.first();
  await first.hover();
  await first.getByTestId('explorer-tree-node-operation-button').click();
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
  const cell = page.getByTestId('page-list-item-title').getByText('test page');
  await expect(cell).toBeVisible();
  await page
    .getByTestId('explorer-collections')
    .getByTestId('category-divider-collapse-button')
    .click();
  const nullCollection = page.getByTestId(
    'slider-bar-collection-empty-message'
  );
  await expect(nullCollection).toBeVisible();
  await page.getByTestId('explorer-bar-add-collection-button').click();
  const title = page.getByTestId('input-collection-title');
  await expect(title).toBeVisible();
  await title.fill('test collection');
  await page.getByTestId('save-collection').click();
  await page.waitForTimeout(100);
  const collections = page.getByTestId('explorer-collections');
  const items = collections.locator('[data-testid^="explorer-collection-"]');
  expect(await items.count()).toBe(1);
  await expect(nullCollection).not.toBeVisible();
});
