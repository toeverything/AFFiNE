import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  getPageOperationButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { getCurrentDocIdFromUrl } from '@affine-test/kit/utils/url';
import { expect } from '@playwright/test';

test('click btn new page and open in tab', async ({ page, workspace }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page');
  const newPageUrl = page.url();
  const newPageId = getCurrentDocIdFromUrl(page);

  await page.getByTestId('all-pages').click();

  await getPageOperationButton(page, newPageId).click();
  const [newTabPage] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('menuitem', { name: 'Open in new tab' }).click(),
  ]);

  await expect(newTabPage).toHaveURL(newPageUrl, { timeout: 15000 });

  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.meta.flavour).toContain('local');
});

test('switch between new page and all page', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);

  const title = 'this is a new page';

  await clickNewPageButton(page, title);
  await page.getByTestId('all-pages').click();

  const cell = page.getByTestId('page-list-item').getByText(title);
  await expect(cell).toBeVisible();

  await cell.click();
  await expect(getBlockSuiteEditorTitle(page)).toHaveText(title);

  await page.getByTestId('all-pages').click();
  await expect(cell).toBeVisible();
});

test('ctrl click all page and open in new tab', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);

  const [newTabPage] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByTestId('all-pages').click({
      modifiers: ['ControlOrMeta'],
    }),
  ]);

  await expect(newTabPage).toHaveURL(/\/all/, {
    timeout: 15000,
  });
});

test('mid click all page and open in new tab', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);

  const [newTabPage] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByTestId('all-pages').click({
      button: 'middle',
    }),
  ]);

  await expect(newTabPage).toHaveURL(/\/all/, {
    timeout: 15000,
  });
});

test('ctrl click embedded doc link and open in new tab', async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);

  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page');
  const newPageUrl = page.url();

  await clickNewPageButton(page);
  await page.keyboard.press('Enter'); // goto main content

  // paste new page url to create linked page
  await page.evaluate(
    async ([url]) => {
      const clipData = {
        'text/plain': url,
      };
      const e = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      });
      Object.defineProperty(e, 'target', {
        writable: false,
        value: document,
      });
      Object.entries(clipData).forEach(([key, value]) => {
        e.clipboardData?.setData(key, value);
      });
      document.dispatchEvent(e);
    },
    [newPageUrl]
  );

  const referenceNode = page.locator(
    'affine-reference:has-text("this is a new page")'
  );

  // hover on the reference node and change it to embedded card mode
  await referenceNode.hover();

  const referencePopup = page.locator(
    'reference-popup .affine-reference-popover-container'
  );

  await expect(referencePopup).toBeVisible();
  await referencePopup.getByRole('button', { name: 'Switch view' }).click();
  await page.getByRole('button', { name: 'Card view' }).click();

  const embededDocBlock = page.locator('affine-embed-linked-doc-block');

  await expect(embededDocBlock).toBeVisible();

  // open in new tab
  const [newTabPage] = await Promise.all([
    page.waitForEvent('popup'),
    embededDocBlock.click({
      button: 'left',
      modifiers: ['ControlOrMeta'],
    }),
  ]);

  await expect(newTabPage).toHaveURL(newPageUrl, { timeout: 15000 });
});
