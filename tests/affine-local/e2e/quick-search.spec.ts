import { test } from '@affine-test/kit/playwright';
import { withCtrlOrMeta } from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  getBlockSuiteEditorTitle,
  newPage,
  waitEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page } from '@playwright/test';

const openQuickSearchByShortcut = async (page: Page) =>
  await withCtrlOrMeta(page, () => page.keyboard.press('k', { delay: 50 }));

async function assertTitle(page: Page, text: string) {
  const edgeless = page.locator('affine-edgeless-page');
  if (!edgeless) {
    const locator = page.locator('.affine-doc-page-block-title').nth(0);
    const actual = await locator.inputValue();
    expect(actual).toBe(text);
  }
}

async function assertResultList(page: Page, texts: string[]) {
  const actual = await page.locator('[cmdk-item]').allInnerTexts();
  expect(actual).toEqual(texts);
}

async function titleIsFocused(page: Page) {
  const edgeless = page.locator('affine-edgeless-page');
  if (!edgeless) {
    const title = page.locator('.affine-doc-page-block-title');
    await expect(title).toBeVisible();
    await expect(title).toBeFocused();
  }
}

test('Click slider bar button', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  const quickSearchButton = page.locator(
    '[data-testid=slider-bar-quick-search-button]'
  );
  await quickSearchButton.click();
  const quickSearch = page.locator('[data-testid=quickSearch]');
  await expect(quickSearch).toBeVisible();
});

test('Click arrowDown icon after title', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  const quickSearchButton = page.locator(
    '[data-testid=slider-bar-quick-search-button]'
  );
  await quickSearchButton.click();
  const quickSearch = page.locator('[data-testid=quickSearch]');
  await expect(quickSearch).toBeVisible();
});

test('Press the shortcut key cmd+k', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  const quickSearch = page.locator('[data-testid=quickSearch]');
  await expect(quickSearch).toBeVisible();
});

test('Create a new page without keyword', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  const addNewPage = page.locator('[data-testid=quick-search-add-new-page]');
  await addNewPage.click();
  await page.waitForTimeout(300);
  await assertTitle(page, '');
});

test('Create a new page with keyword', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  await page.keyboard.insertText('test123456');
  const addNewPage = page.locator('[data-testid=quick-search-add-new-page]');
  await addNewPage.click();
  await page.waitForTimeout(300);
  await assertTitle(page, 'test123456');
});

test('Enter a keyword to search for', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  await page.keyboard.insertText('test123456');
  const actual = await page.locator('[cmdk-input]').inputValue();
  expect(actual).toBe('test123456');
});

test('Create a new page and search this page', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  // input title and create new page
  await page.keyboard.insertText('test123456');
  await page.waitForTimeout(300);
  const addNewPage = page.locator('[data-testid=quick-search-add-new-page]');
  await addNewPage.click();

  await page.waitForTimeout(300);
  await assertTitle(page, 'test123456');
  await openQuickSearchByShortcut(page);
  await page.keyboard.insertText('test123456');
  await page.waitForTimeout(300);
  await assertResultList(page, ['test123456']);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await assertTitle(page, 'test123456');
});
test('Navigate to the 404 page and try to open quick search', async ({
  page,
}) => {
  await page.goto('http://localhost:8080/404');
  const notFoundTip = page.locator('[data-testid=notFound]');
  await expect(notFoundTip).toBeVisible();
  await openQuickSearchByShortcut(page);
  const quickSearch = page.locator('[data-testid=quickSearch]');
  await expect(quickSearch).toBeVisible({ visible: false });
});

test('Open quick search on local page', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  const publishedSearchResults = page.locator('[publishedSearchResults]');
  await expect(publishedSearchResults).toBeVisible({ visible: false });
});

test('Autofocus input after opening quick search', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  const locator = page.locator('[cmdk-input]');
  await expect(locator).toBeVisible();
  await expect(locator).toBeFocused();
});
test('Autofocus input after select', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  await page.keyboard.press('ArrowUp');
  const locator = page.locator('[cmdk-input]');
  await expect(locator).toBeVisible();
  await expect(locator).toBeFocused();
});
test('Focus title after creating a new page', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  const addNewPage = page.locator('[data-testid=quick-search-add-new-page]');
  await addNewPage.click();
  await titleIsFocused(page);
});

test('Not show navigation path if page is not a subpage or current page is not in editor', async ({
  page,
}) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await openQuickSearchByShortcut(page);
  expect(await page.getByTestId('navigation-path').count()).toBe(0);
});

test('Assert the recent browse pages are on the recent list', async ({
  page,
}) => {
  await openHomePage(page);
  await waitEditorLoad(page);

  // create first page
  await newPage(page);
  await page.keyboard.insertText('sgtokidoki');
  await page.waitForTimeout(200);

  // create second page
  await openQuickSearchByShortcut(page);
  const addNewPage = page.getByTestId('quick-search-add-new-page');
  await addNewPage.click();
  await page.keyboard.insertText('theliquidhorse');
  await page.waitForTimeout(200);

  // create thrid page
  await openQuickSearchByShortcut(page);
  await addNewPage.click();
  await page.keyboard.insertText('battlekot');
  await page.waitForTimeout(200);

  await openQuickSearchByShortcut(page);
  await page.waitForTimeout(200);
  {
    // check does all 3 pages exists on recent page list
    const quickSearchItems = page.locator('[cmdk-item]');
    expect(await quickSearchItems.nth(0).textContent()).toBe('battlekot');
    expect(await quickSearchItems.nth(1).textContent()).toBe('theliquidhorse');
    expect(await quickSearchItems.nth(2).textContent()).toBe('sgtokidoki');
  }

  // create forth page, and check does the recent page list only contains three pages
  await openHomePage(page);
  await page.waitForTimeout(1000);
  await openQuickSearchByShortcut(page);
  await addNewPage.click();
  await page.waitForTimeout(200);
  {
    const title = getBlockSuiteEditorTitle(page);
    await title.type('affine is the best', {
      delay: 50,
    });
  }
  await page.waitForTimeout(1000);
  await openQuickSearchByShortcut(page);
  {
    const quickSearchItems = page.locator('[cmdk-item]');
    expect(await quickSearchItems.nth(0).textContent()).toBe(
      'affine is the best'
    );
    expect(await quickSearchItems.nth(1).textContent()).toBe('battlekot');
    expect(await quickSearchItems.nth(2).textContent()).toBe('theliquidhorse');
  }
});
