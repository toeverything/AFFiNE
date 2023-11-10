import { test } from '@affine-test/kit/playwright';
import { withCtrlOrMeta } from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { expect, type Page } from '@playwright/test';

const openQuickSearchByShortcut = async (page: Page) => {
  await withCtrlOrMeta(page, () => page.keyboard.press('k', { delay: 50 }));
  await page.waitForTimeout(1000);
};

const keyboardDownAndSelect = async (page: Page, label: string) => {
  await page.keyboard.press('ArrowDown');
  if (
    (await page
      .locator('[cmdk-item][data-selected] [data-testid="cmdk-label"]')
      .innerText()) !== label
  ) {
    await keyboardDownAndSelect(page, label);
  } else {
    await page.keyboard.press('Enter');
  }
};

const commandsIsVisible = async (page: Page, label: string) => {
  const locators = page.locator('[cmdk-item] [data-testid="cmdk-label"]');
  const actual = (await locators.allInnerTexts()).find(text => text === label);
  return !!actual;
};

async function assertTitle(page: Page, text: string) {
  const edgeless = page.locator('affine-edgeless-page');
  if (!edgeless) {
    const locator = page.locator('.affine-doc-page-block-title').nth(0);
    const actual = await locator.inputValue();
    expect(actual).toBe(text);
  }
}

async function checkElementIsInView(page: Page, searchText: string) {
  const element = page.getByText(searchText);
  // check if the element is in view
  const elementRect = await element.boundingBox();
  const viewportHeight = page.viewportSize()?.height;

  if (!elementRect || !viewportHeight) {
    return false;
  }
  expect(elementRect.y).toBeLessThan(viewportHeight);
  expect(elementRect.y + elementRect.height).toBeGreaterThan(0);

  return true;
}

async function waitForScrollToFinish(page: Page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let lastScrollTop: number;
      const interval = setInterval(() => {
        const { scrollTop } = document.documentElement;
        if (scrollTop != lastScrollTop) {
          lastScrollTop = scrollTop;
        } else {
          clearInterval(interval);
          resolve(null);
        }
      }, 500); // you can adjust the interval time
    });
  });
}

async function assertResultList(page: Page, texts: string[]) {
  const actual = await page
    .locator('[cmdk-item] [data-testid=cmdk-label]')
    .allInnerTexts();
  const actualSplit = actual[0].split('\n');
  expect(actualSplit[0]).toEqual(texts[0]);
  expect(actualSplit[1]).toEqual(texts[1]);
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
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  const quickSearchButton = page.locator(
    '[data-testid=slider-bar-quick-search-button]'
  );
  await quickSearchButton.click();
  const quickSearch = page.locator('[data-testid=cmdk-quick-search]');
  await expect(quickSearch).toBeVisible();
});

test('Press the shortcut key cmd+k and close with esc', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  const quickSearch = page.locator('[data-testid=cmdk-quick-search]');
  await expect(quickSearch).toBeVisible();

  // press esc to close quick search
  await page.keyboard.press('Escape');
  await expect(quickSearch).toBeVisible({ visible: false });
});

test('Create a new page without keyword', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  const addNewPage = page.locator('[cmdk-item] >> text=New Page');
  await addNewPage.click();
  await page.waitForTimeout(300);
  await assertTitle(page, '');
});

test('Create a new page with keyword', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  await page.keyboard.insertText('test123456');
  const addNewPage = page.locator('[cmdk-item] >> text=New "test123456" Page');
  await addNewPage.click();
  await page.waitForTimeout(300);
  await assertTitle(page, 'test123456');
});

test('Enter a keyword to search for', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  await page.keyboard.insertText('test123456');
  const actual = await page.locator('[cmdk-input]').inputValue();
  expect(actual).toBe('test123456');
});

test('Create a new page and search this page', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  // input title and create new page
  await page.keyboard.insertText('test123456');
  await page.waitForTimeout(300);
  const addNewPage = page.locator('[cmdk-item] >> text=New "test123456" Page');
  await addNewPage.click();

  await page.waitForTimeout(300);
  await assertTitle(page, 'test123456');
  await openQuickSearchByShortcut(page);
  await page.keyboard.insertText('test123456');
  await page.waitForTimeout(300);
  await assertResultList(page, ['test123456', 'test123456']);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await assertTitle(page, 'test123456');

  await page.reload();
  await waitForEditorLoad(page);
  await openQuickSearchByShortcut(page);
  await page.keyboard.insertText('test123456');
  await page.waitForTimeout(300);
  await assertResultList(page, ['test123456', 'test123456']);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await assertTitle(page, 'test123456');
});

test('Navigate to the 404 page and try to open quick search', async ({
  page,
}) => {
  await page.goto('http://localhost:8080/404');
  const notFoundTip = page.locator('button >> text=Back to My Content');
  await expect(notFoundTip).toBeVisible();
  await openQuickSearchByShortcut(page);
  const quickSearch = page.locator('[data-testid=cmdk-quick-search]');
  await expect(quickSearch).toBeVisible({ visible: false });
});

test('Open quick search on local page', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  const publishedSearchResults = page.locator('[publishedSearchResults]');
  await expect(publishedSearchResults).toBeVisible({ visible: false });
});

test('Autofocus input after opening quick search', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  const locator = page.locator('[cmdk-input]');
  await expect(locator).toBeVisible();
  await expect(locator).toBeFocused();
});
test('Autofocus input after select', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  await page.keyboard.press('ArrowUp');
  const locator = page.locator('[cmdk-input]');
  await expect(locator).toBeVisible();
  await expect(locator).toBeFocused();
});
test('Focus title after creating a new page', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  const addNewPage = page.locator('[cmdk-item] >> text=New Page');
  await addNewPage.click();
  await titleIsFocused(page);
});

test('can use keyboard down to select goto setting', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await openQuickSearchByShortcut(page);
  await keyboardDownAndSelect(page, 'Go to Settings');

  await expect(page.getByTestId('setting-modal')).toBeVisible();
});

test('assert the recent browse pages are on the recent list', async ({
  page,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);

  // create first page
  await clickNewPageButton(page);
  await waitForEditorLoad(page);
  {
    const title = getBlockSuiteEditorTitle(page);
    await title.pressSequentially('sgtokidoki');
    expect(await title.innerText()).toBe('sgtokidoki');
  }

  // create second page
  await openQuickSearchByShortcut(page);
  const addNewPage = page.locator('[cmdk-item] >> text=New Page');
  await addNewPage.click();
  await waitForEditorLoad(page);
  {
    const title = getBlockSuiteEditorTitle(page);
    await title.pressSequentially('theliquidhorse');
    expect(await title.innerText()).toBe('theliquidhorse');
  }
  await page.waitForTimeout(200);

  // create thrid page
  await openQuickSearchByShortcut(page);
  await addNewPage.click();
  await waitForEditorLoad(page);
  {
    const title = getBlockSuiteEditorTitle(page);
    await title.pressSequentially('battlekot');
    expect(await title.innerText()).toBe('battlekot');
  }

  await openQuickSearchByShortcut(page);
  {
    // check does all 3 pages exists on recent page list
    const quickSearchItems = page.locator(
      '[cmdk-item] [data-testid="cmdk-label"]'
    );
    expect(await quickSearchItems.nth(0).textContent()).toBe('battlekot');
    expect(await quickSearchItems.nth(1).textContent()).toBe('theliquidhorse');
    expect(await quickSearchItems.nth(2).textContent()).toBe('sgtokidoki');
  }

  // create forth page, and check does the recent page list only contains three pages
  await page.reload();
  await waitForEditorLoad(page);
  await openQuickSearchByShortcut(page);
  {
    const addNewPage = page.locator('[cmdk-item] >> text=New Page');
    await addNewPage.click();
  }
  await waitForEditorLoad(page);
  {
    const title = getBlockSuiteEditorTitle(page);
    await title.pressSequentially('affine is the best');
    expect(await title.innerText()).toBe('affine is the best');
  }
  await page.waitForTimeout(1000);
  await openQuickSearchByShortcut(page);
  {
    const quickSearchItems = page.locator(
      '[cmdk-item] [data-testid="cmdk-label"]'
    );
    expect(await quickSearchItems.nth(0).textContent()).toBe(
      'affine is the best'
    );
  }
});

test('can use cmdk to export pdf', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to export');
  await openQuickSearchByShortcut(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    keyboardDownAndSelect(page, 'Export to PDF'),
  ]);
  expect(download.suggestedFilename()).toBe('this is a new page to export.pdf');
});
test('can use cmdk to export png', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to export');
  await openQuickSearchByShortcut(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    keyboardDownAndSelect(page, 'Export to PNG'),
  ]);
  expect(download.suggestedFilename()).toBe('this is a new page to export.png');
});

test('can use cmdk to delete page and restore it', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to delete');
  await openQuickSearchByShortcut(page);
  await keyboardDownAndSelect(page, 'Move to Trash');
  await page.getByTestId('confirm-delete-page').click();
  const restoreButton = page.getByTestId('page-restore-button');
  await expect(restoreButton).toBeVisible();
  await openQuickSearchByShortcut(page);
  expect(await commandsIsVisible(page, 'Move to Trash')).toBe(false);
  expect(await commandsIsVisible(page, 'Export to PDF')).toBe(false);
  expect(await commandsIsVisible(page, 'Restore from Trash')).toBe(true);
  await keyboardDownAndSelect(page, 'Restore from Trash');
  await expect(restoreButton).not.toBeVisible();
});

test('show not found item', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  // input title and create new page
  await page.keyboard.insertText('test123456');
  const notFoundItem = page.getByTestId('cmdk-search-not-found');
  await expect(notFoundItem).toBeVisible();
  await expect(notFoundItem).toHaveText('Search for "test123456"');
});

test('can use cmdk to search page content and scroll to it, then the block will be selected', async ({
  page,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill(
    'this is a new page to search for content'
  );
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Enter', { delay: 10 });
  }
  await page.keyboard.insertText('123456');
  await clickSideBarAllPageButton(page);
  await openQuickSearchByShortcut(page);
  await page.keyboard.insertText('123456');
  await page.waitForTimeout(300);
  await assertResultList(page, [
    'this is a new page to search for content',
    '123456',
  ]);
  await page.keyboard.press('Enter');
  await waitForScrollToFinish(page);
  const isVisitable = await checkElementIsInView(page, '123456');
  expect(isVisitable).toBe(true);
  const selectionElement = page.locator('affine-block-selection');
  await expect(selectionElement).toBeVisible();
});
