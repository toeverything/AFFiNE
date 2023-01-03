import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './libs/load-page';
import { withCtrlOrMeta } from './libs/keyboard';
import { newPage } from './libs/page-logic';
loadPage();

const openQuickSearchByShortcut = async (page: Page) =>
  await withCtrlOrMeta(page, () => page.keyboard.press('k', { delay: 50 }));

async function assertTitleTexts(page: Page, texts: string[]) {
  const actual = await page
    .locator('.affine-default-page-block-title')
    .allTextContents();
  expect(actual).toEqual(texts);
}
async function assertResultList(page: Page, texts: string[]) {
  const actual = await page.locator('[cmdk-item]').allInnerTexts();
  expect(actual).toEqual(texts);
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
  // FIXME: not working
  test('Create a new page without keyword', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await page.waitForTimeout(200);
    await assertTitleTexts(page, ['']);
  });

  test('Create a new page with keyword', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    await page.keyboard.insertText('test123456');
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await page.waitForTimeout(200);
    await assertTitleTexts(page, ['test123456']);
  });
});

test.describe('Search and select', () => {
  test('Create a new page and search this page', async ({ page }) => {
    await newPage(page);
    await openQuickSearchByShortcut(page);
    await page.keyboard.insertText('test123456');
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await page.waitForTimeout(200);
    await openQuickSearchByShortcut(page);
    await page.keyboard.insertText('test123456');
    await assertResultList(page, ['test123456']);
    await page.keyboard.press('Enter', { delay: 50 });
    await assertTitleTexts(page, ['test123456']);
  });
});
