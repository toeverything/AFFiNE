import { expect, type Page } from '@playwright/test';

import { withCtrlOrMeta } from '../libs/keyboard';
import { initHomePageWithPinboard, openHomePage } from '../libs/load-page';
import {
  createPinboardPage,
  newPage,
  waitMarkdownImported,
} from '../libs/page-logic';
import { test } from '../libs/playwright';

const openQuickSearchByShortcut = async (page: Page) =>
  await withCtrlOrMeta(page, () => page.keyboard.press('k', { delay: 50 }));

async function assertTitle(page: Page, text: string) {
  const edgeless = page.locator('affine-edgeless-page');
  if (!edgeless) {
    const locator = page.locator('.affine-default-page-block-title').nth(0);
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
    const title = page.locator('.affine-default-page-block-title');
    await expect(title).toBeVisible();
    await expect(title).toBeFocused();
  }
}

test('Click slider bar button', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
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
  await waitMarkdownImported(page);
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
  await waitMarkdownImported(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  const quickSearch = page.locator('[data-testid=quickSearch]');
  await expect(quickSearch).toBeVisible();
});

test('Create a new page without keyword', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  const addNewPage = page.locator('[data-testid=quick-search-add-new-page]');
  await addNewPage.click();
  await page.waitForTimeout(300);
  await assertTitle(page, '');
});

test('Create a new page with keyword', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
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
  await waitMarkdownImported(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  await page.keyboard.insertText('test123456');
  const actual = await page.locator('[cmdk-input]').inputValue();
  expect(actual).toBe('test123456');
});

test('Create a new page and search this page', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
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
  await waitMarkdownImported(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  const publishedSearchResults = page.locator('[publishedSearchResults]');
  await expect(publishedSearchResults).toBeVisible({ visible: false });
});

test('Autofocus input after opening quick search', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  const locator = page.locator('[cmdk-input]');
  await expect(locator).toBeVisible();
  await expect(locator).toBeFocused();
});
test('Autofocus input after select', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  await page.keyboard.press('ArrowUp');
  const locator = page.locator('[cmdk-input]');
  await expect(locator).toBeVisible();
  await expect(locator).toBeFocused();
});
test('Focus title after creating a new page', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await newPage(page);
  await openQuickSearchByShortcut(page);
  const addNewPage = page.locator('[data-testid=quick-search-add-new-page]');
  await addNewPage.click();
  await titleIsFocused(page);
});

test('When opening the website for the first time, the first folding sidebar will appear novice guide', async ({
  page,
}) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  const quickSearchTips = page.locator('[data-testid=quick-search-tips]');
  await expect(quickSearchTips).not.toBeVisible();
  await page.getByTestId('sliderBar-arrowButton-collapse').click();
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).not.toBeInViewport();
  await expect(quickSearchTips).toBeVisible();
  await page.locator('[data-testid=quick-search-got-it]').click();
  await expect(quickSearchTips).not.toBeVisible();
});
test('After appearing once, it will not appear a second time', async ({
  page,
}) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  const quickSearchTips = page.locator('[data-testid=quick-search-tips]');
  await expect(quickSearchTips).not.toBeVisible();
  await page.getByTestId('sliderBar-arrowButton-collapse').click();
  const sliderBarArea = page.getByTestId('sliderBar');
  await expect(sliderBarArea).not.toBeVisible();
  await expect(quickSearchTips).toBeVisible();
  await page.locator('[data-testid=quick-search-got-it]').click();
  await expect(quickSearchTips).not.toBeVisible();
  await page.reload();
  await page.locator('[data-testid=sliderBar-arrowButton-expand]').click();
  await page.getByTestId('sliderBar-arrowButton-collapse').click();
  await expect(quickSearchTips).not.toBeVisible();
});

test('Show navigation path if page is a subpage', async ({ page }) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
  await openQuickSearchByShortcut(page);
  expect(await page.getByTestId('navigation-path').count()).toBe(1);
});
test('Not show navigation path if page is not a subpage or current page is not in editor', async ({
  page,
}) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await openQuickSearchByShortcut(page);
  expect(await page.getByTestId('navigation-path').count()).toBe(0);
});
test('Navigation path item click will jump to page, but not current active item', async ({
  page,
}) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
  await openQuickSearchByShortcut(page);
  const oldUrl = page.url();
  expect(
    await page.locator('[data-testid="navigation-path-link"]').count()
  ).toBe(2);
  await page.locator('[data-testid="navigation-path-link"]').nth(1).click();
  expect(page.url()).toBe(oldUrl);
  await page.locator('[data-testid="navigation-path-link"]').nth(0).click();
  expect(page.url()).not.toBe(oldUrl);
});
test('Navigation path expand', async ({ page }) => {
  //
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
  await openQuickSearchByShortcut(page);
  const top = await page
    .getByTestId('navigation-path-expand-panel')
    .evaluate(el => {
      return window.getComputedStyle(el).getPropertyValue('top');
    });
  expect(parseInt(top)).toBeLessThan(0);
  await page.getByTestId('navigation-path-expand-btn').click();
  await page.waitForTimeout(500);
  const expandTop = await page
    .getByTestId('navigation-path-expand-panel')
    .evaluate(el => {
      return window.getComputedStyle(el).getPropertyValue('top');
    });
  expect(expandTop).toBe('0px');
});
