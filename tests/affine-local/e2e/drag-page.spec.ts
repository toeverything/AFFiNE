import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  dragTo,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const dragToFavourites = async (
  page: Page,
  dragItem: Locator,
  pageId: string
) => {
  const favourites = page.getByTestId('favourites');
  await dragTo(page, dragItem, favourites);
  const favouritePage = page.getByTestId(`favourite-page-${pageId}`);
  expect(favouritePage).not.toBeUndefined();
  return favouritePage;
};

const dragToCollection = async (page: Page, dragItem: Locator) => {
  await page.getByTestId('slider-bar-add-collection-button').click();
  const input = page.getByTestId('input-collection-title');
  await expect(input).toBeVisible();
  await input.fill('test collection');
  await page.getByTestId('save-collection').click();
  const collection = page.getByTestId('collection-item');
  expect(collection).not.toBeUndefined();
  await clickSideBarAllPageButton(page);
  await dragTo(page, dragItem, collection);
  await page.waitForTimeout(500);
  await collection.getByTestId('fav-collapsed-button').click();
  const collectionPage = page.getByTestId('collection-page');
  expect(collectionPage).not.toBeUndefined();
  return collectionPage;
};

const dragToTrash = async (page: Page, title: string, dragItem: Locator) => {
  // drag to trash
  await dragTo(page, dragItem, page.getByTestId('trash-page'));
  const confirmTip = page.getByText('Delete page?');
  expect(confirmTip).not.toBeUndefined();

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

test('drag a page from "All pages" list to favourites, then drag to trash', async ({
  page,
}) => {
  const title = 'this is a new page to drag';
  {
    await openHomePage(page);
    await waitForEditorLoad(page);
    await clickNewPageButton(page);
    await getBlockSuiteEditorTitle(page).fill(title);
  }
  const pageId = page.url().split('/').reverse()[0];
  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(500);

  const favouritePage = await dragToFavourites(
    page,
    page.locator(`[role="button"]:has-text("${title}")`),
    pageId
  );

  await dragToTrash(page, title, favouritePage);
});

test('drag a page from "All pages" list to collections, then drag to trash', async ({
  page,
}) => {
  const title = 'this is a new page to drag';
  {
    await openHomePage(page);
    await waitForEditorLoad(page);
    await clickNewPageButton(page);
    await getBlockSuiteEditorTitle(page).fill(title);
  }
  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(500);

  const collectionPage = await dragToCollection(
    page,
    page.locator(`[role="button"]:has-text("${title}")`)
  );

  await dragToTrash(page, title, collectionPage);
});

test('drag a page from "All pages" list to trash', async ({ page }) => {
  const title = 'this is a new page to drag';
  {
    await openHomePage(page);
    await waitForEditorLoad(page);
    await clickNewPageButton(page);
    await getBlockSuiteEditorTitle(page).fill(title);
  }
  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(500);

  await dragToTrash(
    page,
    title,
    page.locator(`[role="button"]:has-text("${title}")`)
  );
});

test('drag a page from favourites to collection', async ({ page }) => {
  const title = 'this is a new page to drag';
  {
    await openHomePage(page);
    await waitForEditorLoad(page);
    await clickNewPageButton(page);
    await getBlockSuiteEditorTitle(page).fill(title);
  }
  const pageId = page.url().split('/').reverse()[0];
  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(500);

  // drag to favourites
  const favouritePage = await dragToFavourites(
    page,
    page.locator(`[role="button"]:has-text("${title}")`),
    pageId
  );

  // drag to collections
  await dragToCollection(page, favouritePage);
});
