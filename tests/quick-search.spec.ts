import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './libs/load-page';
import { withCtrlOrMeta } from './libs/keyboard';

loadPage();
const IS_MAC = process.platform === 'darwin';
// const IS_WINDOWS = process.platform === 'win32';
// const IS_LINUX = !IS_MAC && !IS_WINDOWS;

const openQuickSearchByShortcut = async (page: Page) =>
  await withCtrlOrMeta(page, () => page.keyboard.press('k', { delay: 50 }));

async function assertTitleTexts(
  page: Page,
  texts: string[],
  option?: { delay: number }
) {
  await page.mouse.move(100, 100); // move mouse for focus
  const actual = await page
    .locator('[class=affine-default-page-block-title]')
    .allInnerTexts();
  setTimeout(() => {
    expect(actual).toEqual(texts);
  }, option?.delay);
}

test.describe('Open quick search', () => {
  test('Click slider bar button', async ({ page }) => {
    const quickSearchButton = page.locator(
      '[data-testid=sliderBar-quickSearchButton]'
    );
    await quickSearchButton.click();
    const quickSearch = page.locator('[data-testid=quickSearch]');
    expect(quickSearch.isVisible()).toEqual(true);
  });
  test('Click arrowDown icon after title', async ({ page }) => {
    //header-quickSearchButton
    const quickSearchButton = page.locator(
      '[data-testid=header-quickSearchButton]'
    );
    await quickSearchButton.click();
    const quickSearch = page.locator('[data-testid=quickSearch]');
    expect(quickSearch.isVisible()).toEqual(true);
  });
  test('Press the shortcut key cmd+k', async ({ page }) => {
    await openQuickSearchByShortcut(page);
    const quickSearch = page.locator('[data-testid=quickSearch]');
    expect(quickSearch.isVisible()).toEqual(true);
  });
});

test.describe('Add new page in quick search', () => {
  test('Create a new page without keyword', async ({ page }) => {
    await openQuickSearchByShortcut(page);
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await assertTitleTexts(page, [''], { delay: 50 });
  });
  test('Create a new page with keyword', async ({ page }) => {
    await openQuickSearchByShortcut(page);
    await page.keyboard.insertText('test');
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await assertTitleTexts(page, ['test'], { delay: 50 });
  });
});
