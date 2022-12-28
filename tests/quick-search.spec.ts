import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './libs/load-page';
import { withCtrlOrMeta } from './libs/keyboard';

loadPage();

const openQuickSearchByShortcut = async (page: Page) =>
  await withCtrlOrMeta(page, () => page.keyboard.press('k', { delay: 50 }));

async function assertTitleTexts(
  page: Page,
  texts: string[],
  option?: { delay: number }
) {
  await page.mouse.move(100, 100);
  const actual = await page
    .locator('[class=affine-default-page-block-title]')
    .allInnerTexts();
  await page.waitForTimeout(option?.delay || 0);

  expect(actual).toEqual(texts);
}
async function assertResultList(
  page: Page,
  texts: string[],
  option?: { delay: number }
) {
  await page.mouse.move(100, 100);
  const actual = await page.locator('[cmdk-item]').allInnerTexts();
  await page.waitForTimeout(option?.delay || 0);
  expect(actual).toEqual(texts);
}

test.describe('Open quick search', () => {
  test('Click slider bar button', async ({ page }) => {
    const quickSearchButton = page.locator(
      '[data-testid=sliderBar-quickSearchButton]'
    );
    await quickSearchButton.click();
    const quickSearch = page.locator('[data-testid=quickSearch]');
    await expect(quickSearch).toBeVisible();
  });

  test('Click arrowDown icon after title', async ({ page }) => {
    //header-quickSearchButton
    const quickSearchButton = page.locator(
      '[data-testid=header-quickSearchButton]'
    );
    await quickSearchButton.click();
    const quickSearch = page.locator('[data-testid=quickSearch]');
    await expect(quickSearch).toBeVisible();
  });

  // test('Press the shortcut key cmd+k', async ({ page }) => {
  //   // why 1000ms page wait?
  //   page.waitForTimeout(1000);
  //   await openQuickSearchByShortcut(page);
  //   const quickSearch = page.locator('[data-testid=quickSearch]');

  //   await expect(quickSearch).toBeVisible();
  // });
});

test.describe('Add new page in quick search', () => {
  // FIXME: not working
  test.skip('Create a new page without keyword', async ({ page }) => {
    await openQuickSearchByShortcut(page);
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await assertTitleTexts(page, [''], { delay: 50 });
  });

  test.skip('Create a new page with keyword', async ({ page }) => {
    await openQuickSearchByShortcut(page);
    await page.keyboard.insertText('test');
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await assertTitleTexts(page, ['test'], { delay: 50 });
  });
});

test.describe('Search and select', () => {
  // test('Search and get results', async ({ page }) => {
  //   // why 1000ms page wait?
  //   await openQuickSearchByShortcut(page);
  //   await page.keyboard.insertText('Welcome');
  //   await assertResultList(page, ['Welcome to the AFFiNE Alpha'], {
  //     delay: 50,
  //   });
  // });
  //TODO FIXME: This test is not working
  test.skip('Create a new page and search this page', async ({ page }) => {
    await openQuickSearchByShortcut(page);
    await page.keyboard.insertText('Welcome');
    const addNewPage = page.locator('[data-testid=quickSearch-addNewPage]');
    await addNewPage.click();
    await page.waitForTimeout(500);
    await openQuickSearchByShortcut(page);
    await page.keyboard.insertText('Welcome');
    await assertResultList(page, ['Welcome to the AFFiNE Alpha', 'Welcome']);

    await page.keyboard.press('ArrowDown', { delay: 50 });
    await page.keyboard.press('Enter', { delay: 50 });
    await assertTitleTexts(page, ['Welcome'], {
      delay: 50,
    });
  });
});
