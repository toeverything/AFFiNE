import { expect, type Page } from '@playwright/test';
import { test } from './libs/playwright';
import { loadPage } from './libs/load-page';
import { withCtrlOrMeta } from './libs/keyboard';
import { newPage } from './libs/page-logic';
loadPage();

const openQuickSearchByShortcut = async (page: Page) =>
  await withCtrlOrMeta(page, () => page.keyboard.press('k', { delay: 50 }));

async function assertTitle(page: Page, text: string) {
  const locator = page.locator('.affine-default-page-block-title').nth(0);
  const actual = await locator.inputValue();
  expect(actual).toBe(text);
}
async function assertResultList(page: Page, texts: string[]) {
  const actual = await page.locator('[cmdk-item]').allInnerTexts();
  expect(actual).toEqual(texts);
}
async function titleIsFocused(page: Page) {
  const title = page.locator('.affine-default-page-block-title');
  await expect(title).toBeVisible();
  await expect(title).toBeFocused();
}

test.describe('Open quick search', () => {
  test('Click slider bar button', async ({ page }) => {
    await newPage(page);
    const quickSearchButton = page.locator(
      '[data-testid=sliderBar-quickSearchButton]'
    );
    await quickSearchButton.click();
    const quickSearch = page.locator('[data-testid=quickSearch]');
    await expect(quickSearch).toBeVisible();
  });

  test('Click arrowDown icon after title', async ({ page }) => {
    await newPage(page);
    const quickSearchButton = page.locator(
      '[data-testid=header-quickSearchButton]'
    );
    await quickSearchButton.click();
    const quickSearch = page.locator('[data-testid=quickSearch]');
    await expect(quickSearch).toBeVisible();
  });

  test('Press the shortcut key cmd+k', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    const quickSearch = page.locator('[data-testid=quickSearch]');
    await expect(quickSearch).toBeVisible();
  });
});

test.describe('Add new page in quick search', () => {
  test('Create a new page without keyword', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await page.waitForTimeout(300);
    await assertTitle(page, '');
  });

  test('Create a new page with keyword', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    await page.keyboard.insertText('test123456');
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await page.waitForTimeout(300);
    await assertTitle(page, 'test123456');
  });
});

test.describe('Search and select', () => {
  test('Enter a keyword to search for', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    await page.keyboard.insertText('test123456');
    const actual = await page.locator('[cmdk-input]').inputValue();
    expect(actual).toBe('test123456');
  });
  test('Create a new page and search this page', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    await page.keyboard.insertText('test123456');
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await page.waitForTimeout(300);
    await assertTitle(page, 'test123456');
    await openQuickSearchByShortcut(page);
    await page.keyboard.insertText('test123456');
    await assertResultList(page, ['test123456']);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    await assertTitle(page, 'test123456');
  });
});
test.describe('Disable search on 404 page', () => {
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
});
test.describe('Open quick search on the published page', () => {
  test('Open quick search on local page', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    const publishedSearchResults = page.locator('[publishedSearchResults]');
    await expect(publishedSearchResults).toBeVisible({ visible: false });
  });
});

test.describe('Focus event for quick search', () => {
  test('Autofocus input after opening quick search', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    const locator = page.locator('[cmdk-input]');
    await expect(locator).toBeVisible();
    await expect(locator).toBeFocused();
  });
  test('Autofocus input after select', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    await page.keyboard.press('ArrowUp');
    const locator = page.locator('[cmdk-input]');
    await expect(locator).toBeVisible();
    await expect(locator).toBeFocused();
  });
  test('Focus title after creating a new page', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await titleIsFocused(page);
  });
});
