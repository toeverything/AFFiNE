import { test } from '@affine-test/kit/playwright';
import { clickEdgelessModeButton } from '@affine-test/kit/utils/editor';
import {
  copyByKeyboard,
  pasteByKeyboard,
  selectAllByKeyboard,
  withCtrlOrMeta,
  writeTextToClipboard,
} from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

const openQuickSearchByShortcut = async (page: Page, checkVisible = true) => {
  await withCtrlOrMeta(page, () => page.keyboard.press('k', { delay: 50 }));
  if (checkVisible) {
    await expect(page.getByTestId('cmdk-quick-search')).toBeVisible();
  }
};

const insertInputText = async (page: Page, text: string) => {
  await page.locator('[cmdk-input]').fill(text);
  const actual = await page.locator('[cmdk-input]').inputValue();
  expect(actual).toBe(text);
};

const selectItem = async (page: Page, label: string) => {
  const selectedEl = page
    .locator('[cmdk-item] [data-testid="cmdk-label"]')
    .filter({ hasText: label });
  await selectedEl.click();
};

const commandsIsVisible = async (page: Page, label: string) => {
  const locators = page.locator('[cmdk-item] [data-testid="cmdk-label"]');
  const actual = (await locators.allInnerTexts()).find(text => text === label);
  return !!actual;
};

async function assertTitle(page: Page, text: string) {
  const edgeless = page.locator('affine-edgeless-root');
  if (!edgeless) {
    const locator = getBlockSuiteEditorTitle(page);
    const actual = await locator.inputValue();
    expect(actual).toBe(text);
  }
}

async function checkElementIsInView(page: Page, locator: Locator) {
  // check if the element is in view
  const elementRect = await locator.boundingBox();
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
        if (scrollTop !== lastScrollTop) {
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
  await expect(async () => {
    const actual = await page
      .locator('[cmdk-item] [data-testid=cmdk-label]')
      .allInnerTexts();
    const actualSplit = actual[0].split('\n');
    expect(actualSplit[0]).toEqual(texts[0]);
    if (actualSplit[1]) {
      expect(actualSplit[1]).toEqual(texts[1]);
    }
  }).toPass();
}

async function titleIsFocused(page: Page) {
  const edgeless = page.locator('affine-edgeless-root');
  if (!edgeless) {
    const title = getBlockSuiteEditorTitle(page);
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
  const addNewPage = page.getByText('New page', { exact: true });
  await addNewPage.click();
  await page.waitForTimeout(300);
  await assertTitle(page, '');
});

test('Create a new page with keyword', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  await insertInputText(page, '"test123456"');
  const addNewPage = page.locator(
    '[cmdk-item] >> text=New ""test123456"" Page'
  );
  await addNewPage.click();
  await page.waitForTimeout(300);
  await assertTitle(page, '"test123456"');
});

test('Enter a keyword to search for', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  await insertInputText(page, 'test123456');
});

test('Create a new page and search this page', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await openQuickSearchByShortcut(page);
  // input title and create new page
  await insertInputText(page, 'test123456');
  await page.waitForTimeout(300);
  const addNewPage = page.locator('[cmdk-item] >> text=New "test123456" Page');
  await addNewPage.click();

  await page.waitForTimeout(300);
  await assertTitle(page, 'test123456');
  await openQuickSearchByShortcut(page);
  await insertInputText(page, 'test123456');
  await page.waitForTimeout(1000);
  await assertResultList(page, ['test123456', 'test123456']);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  await assertTitle(page, 'test123456');

  await page.reload();
  await waitForEditorLoad(page);
  await openQuickSearchByShortcut(page);
  await insertInputText(page, 'test123456');
  await page.waitForTimeout(1000);
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
  await openQuickSearchByShortcut(page, false);
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
  await page.waitForTimeout(500); // wait for new page loaded
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
  const addNewPage = page.getByText('New page', { exact: true });
  await addNewPage.click();
  await titleIsFocused(page);
});

test('can use keyboard down to select goto setting', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await openQuickSearchByShortcut(page);
  await selectItem(page, 'Go to Settings');

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
    await title.click();
    await page.waitForTimeout(200);
    await title.pressSequentially('sgtokidoki', { delay: 100 });
    await expect(title).toHaveText('sgtokidoki');
  }

  // create second page
  await openQuickSearchByShortcut(page);
  const addNewPage = page.getByText('New page', { exact: true });
  await addNewPage.click();
  await waitForEditorLoad(page);
  {
    const title = getBlockSuiteEditorTitle(page);
    await title.click();
    await page.waitForTimeout(200);
    await title.pressSequentially('theliquidhorse', { delay: 100 });
    await expect(title).toHaveText('theliquidhorse');
  }
  await page.waitForTimeout(200);

  // create thrid page
  await openQuickSearchByShortcut(page);
  await addNewPage.click();
  await waitForEditorLoad(page);
  {
    const title = getBlockSuiteEditorTitle(page);
    await title.click();
    await page.waitForTimeout(200);
    await title.pressSequentially('battlekot', { delay: 100 });
    await expect(title).toHaveText('battlekot');
  }

  await openQuickSearchByShortcut(page);
  {
    // check does all 3 pages exists on recent page list
    const quickSearchItems = page.locator(
      '[cmdk-item] [data-testid="cmdk-label"]'
    );
    await expect(quickSearchItems.nth(0)).toHaveText('battlekot');
    await expect(quickSearchItems.nth(1)).toHaveText('theliquidhorse');
    await expect(quickSearchItems.nth(2)).toHaveText('sgtokidoki');
  }

  // create forth page, and check does the recent page list only contains three pages
  await page.reload();
  await waitForEditorLoad(page);
  await openQuickSearchByShortcut(page);
  {
    const addNewPage = page.getByText('New page', { exact: true });
    await addNewPage.click();
  }
  await waitForEditorLoad(page);
  {
    const title = getBlockSuiteEditorTitle(page);
    await title.click();
    await page.waitForTimeout(200);
    await title.pressSequentially('affine is the best', { delay: 100 });
    await expect(title).toHaveText('affine is the best', { timeout: 500 });
  }
  await page.waitForTimeout(1000);
  await openQuickSearchByShortcut(page);
  {
    const quickSearchItems = page.locator(
      '[cmdk-item] [data-testid="cmdk-label"]'
    );
    await expect(quickSearchItems.nth(0)).toHaveText('affine is the best');
  }
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
    selectItem(page, 'Export to PNG'),
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
  await selectItem(page, 'Move to trash');
  await page.getByTestId('confirm-modal-confirm').click();
  const restoreButton = page.getByTestId('page-restore-button');
  await expect(restoreButton).toBeVisible();
  await page.waitForTimeout(100);
  await openQuickSearchByShortcut(page);
  expect(await commandsIsVisible(page, 'Move to trash')).toBe(false);
  expect(await commandsIsVisible(page, 'Restore from trash')).toBe(true);
  await selectItem(page, 'Restore from trash');
  await expect(restoreButton).not.toBeVisible();
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
  const textBlock = page
    .locator('[data-affine-editor-container]')
    .getByText('123456');
  await expect(textBlock).toBeVisible();
  await clickSideBarAllPageButton(page);
  await openQuickSearchByShortcut(page);
  await insertInputText(page, '123456');
  await page.waitForTimeout(1000);
  await assertResultList(page, [
    'this is a new page to search for content',
    '123456',
  ]);
  await page.locator('[cmdk-item] [data-testid=cmdk-label]').first().click();
  await waitForScrollToFinish(page);
  const isVisitable = await checkElementIsInView(
    page,
    page.locator('[data-affine-editor-container]').getByText('123456')
  );
  expect(isVisitable).toBe(true);
  const selectionElement = page.locator(
    'affine-scroll-anchoring-widget div.highlight'
  );
  await expect(selectionElement).toBeVisible();
});

test('Create a new page with special characters in the title and search for this page', async ({
  page,
}) => {
  const specialTitle = '"test123456"';

  await openHomePage(page);
  await waitForEditorLoad(page);

  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill(specialTitle);
  await openQuickSearchByShortcut(page);

  await insertInputText(page, specialTitle);
  await page.waitForTimeout(1000);

  await assertResultList(page, [specialTitle, specialTitle]);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  await assertTitle(page, specialTitle);
});

test('disable quick search when the link-popup is visitable', async ({
  page,
}) => {
  const specialTitle = '"test"';

  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);

  await openQuickSearchByShortcut(page);
  const quickSearch = page.locator('[data-testid=cmdk-quick-search]');
  await expect(quickSearch).toBeVisible();
  await withCtrlOrMeta(page, () => page.keyboard.press('k'));
  await expect(quickSearch).toBeHidden();

  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill(specialTitle);
  await page.keyboard.press('Enter', { delay: 10 });
  await page.keyboard.insertText('1234567890');
  await page.getByText('1234567890').dblclick();

  await withCtrlOrMeta(page, () => page.keyboard.press('k'));
  const linkPopup = page.locator('.affine-link-popover');
  await expect(linkPopup).toBeVisible();
  const currentQuickSearch = page.locator('[data-testid=cmdk-quick-search]');
  await expect(currentQuickSearch).not.toBeVisible();
});

test('can use @ to open quick search to search for doc and insert into canvas', async ({
  page,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);

  const url = page.url();

  const docTitle = await page.getByTestId('title-edit-button').innerText();

  await clickNewPageButton(page);
  await clickEdgelessModeButton(page);
  await page.locator('affine-edgeless-root').press('@');

  const quickSearch = page.locator('[data-testid=cmdk-quick-search]');
  await expect(quickSearch).toBeVisible();

  // search by using url
  await insertInputText(page, url);

  // expect the default page to be selected
  await expect(
    page.locator('[cmdk-group-items] [cmdk-item][data-selected="true"]')
  ).toContainText(docTitle);

  // press enter to insert the page to canvas
  await page.keyboard.press('Enter');
  await expect(
    page.locator('affine-embed-edgeless-synced-doc-block')
  ).toBeVisible();
  await expect(
    page.getByTestId('edgeless-embed-synced-doc-title')
  ).toContainText(docTitle);

  // focus on the note block
  await page.waitForTimeout(500);
  await page
    .locator('affine-embed-edgeless-synced-doc-block')
    .click({ force: true });
  await page.waitForTimeout(500);
  // double clock to show peek view
  await page
    .locator('affine-embed-edgeless-synced-doc-block')
    .dblclick({ force: true });
  await expect(page.getByTestId('peek-view-modal')).toBeVisible();
});

test('can paste a doc link to create link reference', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  const url = page.url();
  await clickNewPageButton(page);

  // goto main content
  await page.keyboard.press('Enter');

  // paste the url
  await writeTextToClipboard(page, url);

  await expect(
    page.locator('affine-reference:has-text("Getting Started")')
  ).toBeVisible();

  // can ctrl-z to revert to normal link
  await page.keyboard.press('ControlOrMeta+z');

  await expect(page.locator(`affine-link:has-text("${url}")`)).toBeVisible();
});

test('can use slash menu to insert an external link', async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);

  // goto main content
  await page.keyboard.press('Enter');

  // open slash menu
  await page.keyboard.type('/link', {
    delay: 50,
  });
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('cmdk-quick-search')).toBeVisible();

  const link = 'affine.pro';
  await page.locator('[cmdk-input]').fill(link);

  const insertLinkBtn = page.locator(
    '[cmdk-item] [data-value="external-link:affine.pro"]'
  );

  await expect(insertLinkBtn).toBeVisible();

  await insertLinkBtn.click();

  await expect(page.locator('affine-bookmark')).toBeVisible();
  await expect(page.locator('.affine-bookmark-content-url')).toContainText(
    link
  );
});

test('Paste content with keyboard', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page, 'Test');

  // goto main content
  await page.keyboard.press('Enter');

  // input hello world to editor
  await page.keyboard.type('hello world', {
    delay: 50,
  });

  await selectAllByKeyboard(page);
  await copyByKeyboard(page);

  const quickSearchButton = page.locator(
    '[data-testid=slider-bar-quick-search-button]'
  );
  await quickSearchButton.click();
  const quickSearch = page.locator('[data-testid=cmdk-quick-search]');
  await expect(quickSearch).toBeVisible();

  await pasteByKeyboard(page);
  await expect(page.locator('[cmdk-input]')).toHaveValue('hello world');
});
