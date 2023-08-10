import { test } from '@affine-test/kit/playwright';
import {
  checkDatePicker,
  selectDateFromDatePicker,
} from '@affine-test/kit/utils/filter';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  getBlockSuiteEditorTitle,
  newPage,
  waitEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

const createAndPinCollection = async (
  page: Page,
  options?: {
    collectionName?: string;
  }
) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('test page');
  await page.getByTestId('all-pages').click();
  const cell = page.getByRole('cell', {
    name: 'test page',
  });
  await expect(cell).toBeVisible();
  await page.getByTestId('create-first-filter').click();
  await page
    .getByTestId('variable-select')
    .locator('button', { hasText: 'Created' })
    .click();
  await page.getByTestId('save-as-collection').click();
  const title = page.getByTestId('input-collection-title');
  await title.isVisible();
  await title.fill(options?.collectionName ?? 'test collection');
  await page.getByTestId('save-collection').click();
  await page.waitForTimeout(100);
  await page.getByTestId('collection-bar-option-pin').click();
  await page.waitForTimeout(100);
};

test.fixme('Show collections items in sidebar', async ({ page }) => {
  await createAndPinCollection(page);
  const collections = page.getByTestId('collections');
  const items = collections.getByTestId('collection-item');
  expect(await items.count()).toBe(1);
  const first = items.first();
  expect(await first.textContent()).toBe('test collection');
  await first.getByTestId('fav-collapsed-button').click();
  const collectionPage = collections.getByTestId('collection-page').nth(0);
  expect(await collectionPage.textContent()).toBe('test page');
  await collectionPage.getByTestId('collection-page-options').click();
  const deletePage = page
    .getByTestId('collection-page-option')
    .getByText('Delete');
  await deletePage.click();
  expect(await collections.getByTestId('collection-page').count()).toBe(0);
  await first.getByTestId('collection-options').click();
  const deleteCollection = page
    .getByTestId('collection-option')
    .getByText('Delete');
  await deleteCollection.click();
  await page.waitForTimeout(50);
  expect(await items.count()).toBe(0);
});

test('pin and unpin collection', async ({ page }) => {
  const name = 'asd';
  await createAndPinCollection(page, { collectionName: name });
  const collections = page.getByTestId('collections');
  const items = collections.getByTestId('collection-item');
  await page.waitForTimeout(50);
  expect(await items.count()).toBe(1);
  const first = items.first();
  await first.getByTestId('collection-options').click();
  const deleteCollection = page
    .getByTestId('collection-option')
    .getByText('Unpin');
  await deleteCollection.click();
  await page.waitForTimeout(50);
  expect(await items.count()).toBe(0);
  await page.getByTestId('collection-select').click();
  const option = page.locator('[data-testid=collection-select-option]', {
    hasText: name,
  });
  await option.hover();
  await option.getByTestId('collection-select-option-pin').click();
  await page.waitForTimeout(100);
  expect(await items.count()).toBe(1);
});

test('edit collection', async ({ page }) => {
  await createAndPinCollection(page);
  const collections = page.getByTestId('collections');
  const items = collections.getByTestId('collection-item');
  expect(await items.count()).toBe(1);
  const first = items.first();
  await first.getByTestId('collection-options').click();
  const editCollection = page
    .getByTestId('collection-option')
    .getByText('Edit Filter');
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
  await first.getByTestId('collection-options').click();
  const editCollection = page
    .getByTestId('collection-option')
    .getByText('Edit Filter');
  await editCollection.click();
  const title = page.getByTestId('input-collection-title');
  await title.fill('123');
  const today = new Date();
  await page.locator('[data-testid="filter-arg"]').locator('input').click();
  await selectDateFromDatePicker(page, today);
  await checkDatePicker(page, today);
  await page.getByTestId('save-collection').click();
  await page.waitForTimeout(100);
  expect(await first.textContent()).toBe('123');
});

test('create temporary filter by click tag', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('test page');
  await page.locator('affine-page-meta-data').click();
  await page.locator('.add-tag').click();
  await page.keyboard.type('TODO Tag');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.locator('.tag', { hasText: 'TODO Tag' }).click();
  const cell = page.getByRole('cell', {
    name: 'test page',
  });
  await expect(cell).toBeVisible();
  expect(await page.getByTestId('title').count()).toBe(1);
  await page.getByTestId('filter-arg').click();
  await page.getByRole('tooltip').getByText('TODO Tag').click();
  expect(await page.getByTestId('title').count()).toBeGreaterThanOrEqual(2);
});

test('add collection from sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('test page');
  await page.getByTestId('all-pages').click();
  const cell = page.getByRole('cell', {
    name: 'test page',
  });
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
