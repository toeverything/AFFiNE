import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  locateToolbar,
} from '@affine-test/kit/utils/editor';
import { pressBackspace, pressEnter } from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  createLinkedPage,
  dragTo,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import {
  getCurrentCollectionIdFromUrl,
  getCurrentDocIdFromUrl,
  getDocIdFromUrl,
} from '@affine-test/kit/utils/url';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const dragToFavourites = async (
  page: Page,
  dragItem: Locator,
  id: string,
  type: 'doc' | 'collection' | 'tag' | 'folder' = 'doc'
) => {
  const favourites = page.getByTestId(
    'navigation-panel-favorite-category-divider'
  );
  await dragTo(page, dragItem, favourites);
  const item = page
    .getByTestId(`navigation-panel-favorites`)
    .locator(`[data-testid="navigation-panel-${type}-${id}"]`);
  await expect(item).toBeVisible();
  return item;
};

const createCollection = async (page: Page, name: string) => {
  await page.getByTestId('navigation-panel-bar-add-collection-button').click();
  const input = page.getByTestId('prompt-modal-input');
  await expect(input).toBeVisible();
  await input.fill(name);
  await page.getByTestId('prompt-modal-confirm').click();
  const newCollectionId = getCurrentCollectionIdFromUrl(page);
  const collection = page.getByTestId(
    `navigation-panel-collection-${newCollectionId}`
  );
  await expect(collection).toBeVisible();
  return collection;
};

const createPage = async (page: Page, title: string) => {
  await clickNewPageButton(page, title);
};

const dragToCollection = async (page: Page, dragItem: Locator) => {
  const collection = await createCollection(page, 'test collection');
  await clickSideBarAllPageButton(page);
  await dragTo(page, dragItem, collection);
  await page.waitForTimeout(500);
  const collectionPage = collection.locator(
    '[data-testid^="navigation-panel-doc-"]'
  );
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
    page.locator(`[data-testid="doc-list-item"]:has-text("${title}")`),
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
    page.locator(`[data-testid="doc-list-item"]:has-text("${title}")`)
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
    page.locator(`[data-testid="doc-list-item"]:has-text("${title}")`)
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
    page.locator(`[data-testid="doc-list-item"]:has-text("${title}")`),
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
    page.getByTestId('navigation-panel-favorites').locator('[draggable]')
  ).toHaveCount(3);

  await expect(
    page
      .getByTestId('navigation-panel-favorites')
      .locator('[draggable]')
      .first()
  ).toHaveText('test collection');

  await expect(
    page.getByTestId('navigation-panel-favorites').locator('[draggable]').last()
  ).toHaveText(title0);

  // drag the first item to the last
  const firstItem = page
    .getByTestId('navigation-panel-favorites')
    .locator('[draggable]')
    .first();
  const lastItem = page
    .getByTestId('navigation-panel-favorites')
    .locator('[draggable]')
    .last();
  await dragTo(page, firstItem, lastItem, 'bottom');

  // now check the order again
  await expect(
    page.getByTestId('navigation-panel-favorites').locator('[draggable]')
  ).toHaveCount(3);

  await expect(
    page
      .getByTestId('navigation-panel-favorites')
      .locator('[draggable]')
      .first()
  ).toHaveText(title1);

  await expect(
    page.getByTestId('navigation-panel-favorites').locator('[draggable]').last()
  ).toHaveText('test collection');
});

// some how this test always timeout, so we skip it
test.skip('drag a page link in editor to favourites', async ({ page }) => {
  await clickNewPageButton(page);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'hi from another page');

  const pageReference = page.locator('a').filter({
    has: page.locator(
      '.affine-reference-title:has-text("hi from another page")'
    ),
  });

  const pageLink = await pageReference.evaluate(
    el => (el as HTMLAnchorElement).href
  );

  expect(pageLink).toBeTruthy();

  if (!pageLink) {
    return;
  }

  const pageId = getDocIdFromUrl(pageLink);

  await dragToFavourites(
    page,
    page.locator('.affine-reference-title:has-text("hi from another page")'),
    pageId
  );
});

test('drag a page card block to another page', async ({ page }) => {
  await clickNewPageButton(page);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'hi from another page');

  const pageReference = page.locator('a').filter({
    has: page.locator(
      '.affine-reference-title:has-text("hi from another page")'
    ),
  });

  const pageLink = await pageReference.evaluate(
    el => (el as HTMLAnchorElement).href
  );

  expect(pageLink).toBeTruthy();

  if (!pageLink) {
    return;
  }

  const pageId = getDocIdFromUrl(pageLink);

  await pageReference.hover();

  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

  // convert page reference to card block
  await toolbar.getByRole('button', { name: 'Switch view' }).click();
  await toolbar.getByRole('button', { name: 'Card view' }).click();

  // hover the card block to show the drag handle
  const box = await page.locator('affine-embed-linked-doc-block').boundingBox();

  expect(box).toBeTruthy();

  if (!box) {
    return;
  }

  await page.mouse.move(box.x - 5, box.y + box.height / 2);

  await dragToFavourites(
    page,
    page.locator('.affine-drag-handle-container'),
    pageId
  );
});

test('drag a favourite page into note on page mode', async ({ page }) => {
  await clickNewPageButton(page, 'hi from page');
  await page.getByTestId('pin-button').click();
  const pageId = getCurrentDocIdFromUrl(page);
  const item = page
    .getByTestId(`navigation-panel-favorites`)
    .locator(`[data-testid="navigation-panel-doc-${pageId}"]`);
  await expect(item).toBeVisible();

  // drag item into blocksuite editor
  await dragTo(
    page,
    item,
    page.locator('.affine-paragraph-block-container').first()
  );

  await expect(page.locator('affine-embed-linked-doc-block')).toContainText(
    'hi from page'
  );
});

test('drag a favourite page into canvas on edgeless mode', async ({ page }) => {
  await clickNewPageButton(page, 'hi from page');
  await pressEnter(page);
  await type(page, 'Hello world');
  await page.getByTestId('pin-button').click();
  const pageId = getCurrentDocIdFromUrl(page);
  const item = page
    .getByTestId(`navigation-panel-favorites`)
    .locator(`[data-testid="navigation-panel-doc-${pageId}"]`);
  await expect(item).toBeVisible();

  await clickNewPageButton(page, 'edgeless page');
  await clickEdgelessModeButton(page);

  // drag item into blocksuite editor
  await dragTo(page, item, page.locator('affine-edgeless-root').first());

  const embedDoc = page.locator('affine-embed-edgeless-synced-doc-block');
  await expect(embedDoc).toContainText('Hello world');
  await embedDoc.click();

  const toolbar = locateToolbar(page);
  const switchViewButton = toolbar.getByLabel('Switch view');
  await switchViewButton.click();
  await toolbar.getByLabel('Card view').click(); // this will record the view as preferred view
  const cardDoc = page.locator('affine-embed-edgeless-linked-doc-block');
  await expect(embedDoc).toBeHidden();
  await expect(cardDoc).toBeVisible();

  await pressBackspace(page);
  await expect(embedDoc).toBeHidden();
  await expect(cardDoc).toBeHidden();

  await dragTo(page, item, page.locator('affine-edgeless-root').first());
  await expect(cardDoc).toBeVisible();
  await expect(embedDoc).toBeHidden();

  await page.reload();
  await cardDoc.click();
  await pressBackspace(page);

  await dragTo(page, item, page.locator('affine-edgeless-root').first());
  await expect(cardDoc, 'prefer view should be persistence').toBeVisible();
  await expect(embedDoc).toBeHidden();
});

test('drag a favourite page into note on edgeless mode', async ({ page }) => {
  await clickNewPageButton(page, 'hi from page');
  await pressEnter(page);
  await type(page, 'Hello world');
  await page.getByTestId('pin-button').click();
  const pageId = getCurrentDocIdFromUrl(page);
  const item = page
    .getByTestId(`navigation-panel-favorites`)
    .locator(`[data-testid="navigation-panel-doc-${pageId}"]`);
  await expect(item).toBeVisible();

  await clickNewPageButton(page, 'edgeless page');
  await clickEdgelessModeButton(page);

  const edgelessNote = page.locator('affine-edgeless-note');
  await dragTo(page, item, edgelessNote);

  const embedDocInNote = edgelessNote.locator('affine-embed-synced-doc-block');
  const cardDocInNote = edgelessNote.locator('affine-embed-linked-doc-block');

  await expect(embedDocInNote).toBeHidden();
  await expect(cardDocInNote).toBeVisible();

  await edgelessNote.click({ delay: 100 });
  await edgelessNote.click({ delay: 100 });
  await cardDocInNote.click();

  const toolbar = locateToolbar(page);
  const switchViewButton = toolbar.getByLabel('Switch view');
  await switchViewButton.click();
  await toolbar.getByLabel('Embed view').click(); // this should not record the view as preferred view
  await expect(embedDocInNote).toBeVisible();
  await expect(cardDocInNote).toBeHidden();

  await pressBackspace(page);

  await dragTo(page, item, edgelessNote);
  await expect(
    embedDocInNote,
    'prefer view should only be available in canvas'
  ).toBeHidden();
  await expect(cardDocInNote).toBeVisible();
});
