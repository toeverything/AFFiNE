import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarCurrentWorkspaceBanner } from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const createAndPinCollection = async (
  page: Page,
  options?: {
    collectionName?: string;
    skipInitialPage?: boolean;
  }
) => {
  if (!options?.skipInitialPage) {
    await openHomePage(page);
    await waitForEditorLoad(page);
  }
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('test page');
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
  await title.isVisible();
  await title.fill(options?.collectionName ?? 'test collection');
  await page.getByTestId('save-collection').click();
  await page.waitForTimeout(100);
};

test('Show collections items in sidebar', async ({ page }) => {
  await createAndPinCollection(page);
  const collections = page.getByTestId('collections');
  const items = collections.getByTestId('collection-item');
  expect(await items.count()).toBe(1);
  const first = items.first();
  expect(await first.textContent()).toBe('test collection');
  await first.getByTestId('fav-collapsed-button').click();
  const collectionPage = collections.getByTestId('collection-page').nth(0);
  expect(await collectionPage.textContent()).toBe('test page');
  await collectionPage.hover();
  await collectionPage.getByTestId('collection-page-options').click();
  const deletePage = page
    .getByTestId('collection-page-option')
    .getByText('Delete');
  await deletePage.click();
  await page.getByTestId('confirm-delete-page').click();
  expect(await collections.getByTestId('collection-page').count()).toBe(0);
  await first.hover();
  await first.getByTestId('collection-options').click();
  const deleteCollection = page
    .getByTestId('collection-option')
    .getByText('Delete');
  await deleteCollection.click();
  await page.waitForTimeout(50);
  expect(await items.count()).toBe(0);
  await createAndPinCollection(page, {
    skipInitialPage: true,
  });
  expect(await items.count()).toBe(1);
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
  await createAndPinCollection(page);
  const collections = page.getByTestId('collections');
  const items = collections.getByTestId('collection-item');
  expect(await items.count()).toBe(1);
  const first = items.first();
  await first.hover();
  await first.getByTestId('collection-options').click();
  const editCollection = page
    .getByTestId('collection-option')
    .getByText('Rename');
  await editCollection.click();
  const title = page.getByTestId('input-collection-title');
  await title.fill('123');
  await page.getByTestId('save-collection').click();
  await page.waitForTimeout(100);
  expect(await first.textContent()).toBe('123');
});

test('edit collection and change filter date', async ({ page }) => {
  await createAndPinCollection(page);
  const collections = page.getByTestId('collections');
  const items = collections.getByTestId('collection-item');
  expect(await items.count()).toBe(1);
  const first = items.first();
  await first.hover();
  await first.getByTestId('collection-options').click();
  const editCollection = page
    .getByTestId('collection-option')
    .getByText('Rename');
  await editCollection.click();
  const title = page.getByTestId('input-collection-title');
  await title.fill('123');
  await page.getByTestId('save-collection').click();
  await page.waitForTimeout(100);
  expect(await first.textContent()).toBe('123');
});

test('create temporary filter by click tag', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('test page');
  await page.locator('affine-page-meta-data').click();
  await page.locator('.add-tag').click();
  await page.keyboard.type('TODO Tag');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.locator('.tag', { hasText: 'TODO Tag' }).click();
  const cell = page.getByTestId('page-list-item-title').getByText('test page');
  await expect(cell).toBeVisible();
  expect(await page.getByTestId('page-list-item').count()).toBe(1);
  await page.getByTestId('filter-arg').click();

  await page.getByTestId('multi-select-TODO Tag').click();
  expect(
    await page.getByTestId('page-list-item').count()
  ).toBeGreaterThanOrEqual(2);
});

test('add collection from sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('test page');
  await page.getByTestId('all-pages').click();
  const cell = page.getByTestId('page-list-item-title').getByText('test page');
  await expect(cell).toBeVisible();
  const nullCollection = page.getByTestId(
    'slider-bar-collection-null-description'
  );
  await expect(nullCollection).toBeVisible();
  await page.getByTestId('slider-bar-add-collection-button').click();
  const title = page.getByTestId('input-collection-title');
  await title.isVisible();
  await title.fill('test collection');
  await page.getByTestId('save-collection').click();
  await page.waitForTimeout(100);
  const collections = page.getByTestId('collections');
  const items = collections.getByTestId('collection-item');
  expect(await items.count()).toBe(1);
  await expect(nullCollection).not.toBeVisible();
});
