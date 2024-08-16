/* eslint-disable unicorn/prefer-dom-node-dataset */
import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  dragTo,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import {
  getCurrentCollectionIdFromUrl,
  getCurrentDocIdFromUrl,
} from '@affine-test/kit/utils/url';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const dragToFavourites = async (
  page: Page,
  dragItem: Locator,
  id: string,
  type: 'doc' | 'collection' | 'tag' | 'folder' = 'doc'
) => {
  const favourites = page.getByTestId('explorer-favorite-category-divider');
  await dragTo(page, dragItem, favourites);
  const item = page
    .getByTestId(`explorer-favorites`)
    .locator(`[data-testid="explorer-${type}-${id}"]`);
  await expect(item).toBeVisible();
  return item;
};

const createCollection = async (page: Page, name: string) => {
  await page.getByTestId('explorer-bar-add-collection-button').click();
  const input = page.getByTestId('input-collection-title');
  await expect(input).toBeVisible();
  await input.fill(name);
  await page.getByTestId('save-collection').click();
  const newCollectionId = getCurrentCollectionIdFromUrl(page);
  const collection = page.getByTestId(`explorer-collection-${newCollectionId}`);
  await expect(collection).toBeVisible();
  return collection;
};

const createPage = async (page: Page, title: string) => {
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).fill(title);
};

const dragToCollection = async (page: Page, dragItem: Locator) => {
  const collection = await createCollection(page, 'test collection');
  await clickSideBarAllPageButton(page);
  await dragTo(page, dragItem, collection);
  await page.waitForTimeout(500);
  const collectionPage = collection.locator('[data-testid^="explorer-doc-"]');
  await expect(collectionPage).toBeVisible();
  return collectionPage;
};

const dragToTrash = async (page: Page, title: string, dragItem: Locator) => {
  // drag to trash
  await dragTo(page, dragItem, page.getByTestId('trash-page'));
  const confirmTip = page.getByText('Delete doc?');
  await expect(confirmTip).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();

  await expect(
    page.getByText(title),
    'The deleted post is no longer on the All Page list'
  ).toHaveCount(0);
  await page.waitForTimeout(500);
  await page.getByTestId('trash-page').click();

  await expect(
    page.getByText(title),
    'The deleted post exists in the Trash list'
  ).toHaveCount(1);
};

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
});

test('drag a page from "All pages" list to favourites, then drag to trash', async ({
  page,
}) => {
  const title = 'this is a new page to drag';
  await waitForEditorLoad(page);
  await createPage(page, title);
  const pageId = getCurrentDocIdFromUrl(page);
  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(500);

  const favouritePage = await dragToFavourites(
    page,
    page.locator(`[data-testid="page-list-item"]:has-text("${title}")`),
    pageId
  );

  await dragToTrash(page, title, favouritePage);
});

test('drag a page from "All pages" list to collections, then drag to trash', async ({
  page,
}) => {
  const title = 'this is a new page to drag';
  await waitForEditorLoad(page);
  await createPage(page, title);
  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(500);

  const collectionPage = await dragToCollection(
    page,
    page.locator(`[data-testid="page-list-item"]:has-text("${title}")`)
  );

  await dragToTrash(page, title, collectionPage);
});

test('drag a page from "All pages" list to trash', async ({ page }) => {
  const title = 'this is a new page to drag';
  await createPage(page, title);

  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(500);

  await dragToTrash(
    page,
    title,
    page.locator(`[data-testid="page-list-item"]:has-text("${title}")`)
  );
});

test('drag a page from favourites to collection', async ({ page }) => {
  const title = 'this is a new page to drag';
  await createPage(page, title);

  const pageId = getCurrentDocIdFromUrl(page);
  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(500);

  // drag to favourites
  const favouritePage = await dragToFavourites(
    page,
    page.locator(`[data-testid="page-list-item"]:has-text("${title}")`),
    pageId
  );

  // drag to collections
  await dragToCollection(page, favouritePage);
});

test('drag a collection to favourites', async ({ page }) => {
  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(500);
  const collection = await createCollection(page, 'test collection');
  const collectionId = getCurrentCollectionIdFromUrl(page);
  await dragToFavourites(page, collection, collectionId, 'collection');
});

test('items in favourites can be reordered by dragging', async ({ page }) => {
  const title0 = 'this is a new page to drag';
  await createPage(page, title0);
  await page.getByTestId('pin-button').click();

  const title1 = 'this is another new page to drag';
  await createPage(page, title1);
  await page.getByTestId('pin-button').click();

  {
    const collection = await createCollection(page, 'test collection');
    const collectionId = getCurrentCollectionIdFromUrl(page);
    await dragToFavourites(page, collection, collectionId, 'collection');
  }

  // assert the order of the items in favourites
  await expect(
    page.getByTestId('explorer-favorites').locator('[draggable]')
  ).toHaveCount(3);

  await expect(
    page.getByTestId('explorer-favorites').locator('[draggable]').first()
  ).toHaveText('test collection');

  await expect(
    page.getByTestId('explorer-favorites').locator('[draggable]').last()
  ).toHaveText(title0);

  // drag the first item to the last
  const firstItem = page
    .getByTestId('explorer-favorites')
    .locator('[draggable]')
    .first();
  const lastItem = page
    .getByTestId('explorer-favorites')
    .locator('[draggable]')
    .last();
  await dragTo(page, firstItem, lastItem, 'bottom');

  // now check the order again
  await expect(
    page.getByTestId('explorer-favorites').locator('[draggable]')
  ).toHaveCount(3);

  await expect(
    page.getByTestId('explorer-favorites').locator('[draggable]').first()
  ).toHaveText(title1);

  await expect(
    page.getByTestId('explorer-favorites').locator('[draggable]').last()
  ).toHaveText('test collection');
});
