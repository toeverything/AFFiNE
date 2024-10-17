import { test } from '@affine-test/kit/playwright';
import {
  ensureInEdgelessMode,
  ensureInPageMode,
  getPageMode,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  clickPageMoreActions,
  getBlockSuiteEditorTitle,
  waitForAllPagesLoad,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { expect } from '@playwright/test';

test('Switch to edgeless by switch edgeless item', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  const btn = page.getByTestId('switch-edgeless-mode-button');
  await btn.click({ delay: 100 });
  await ensureInEdgelessMode(page);
});

test('Quick Switch Doc Mode, Doc Mode should stable', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await ensureInEdgelessMode(page);
  await page.keyboard.down('Alt');
  await page.keyboard.down('S');
  await page.keyboard.up('S');
  await page.keyboard.up('Alt');

  await page.keyboard.down('Alt');
  await page.keyboard.down('S');
  await page.keyboard.up('S');
  await page.keyboard.up('Alt');

  await page.keyboard.down('Alt');
  await page.keyboard.down('S');
  await page.keyboard.up('S');
  await page.keyboard.up('Alt');

  await page.keyboard.down('Alt');
  await page.keyboard.down('S');
  await page.keyboard.up('S');
  await page.keyboard.up('Alt');

  await page.keyboard.down('Alt');
  await page.keyboard.down('S');
  await page.keyboard.up('S');
  await page.keyboard.up('Alt');

  await ensureInPageMode(page);
  await page.waitForTimeout(1000);
  expect(await getPageMode(page)).toBe('page');
});

test('default to edgeless by editor header items', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page, 'this is a new page');
  const title = getBlockSuiteEditorTitle(page);
  expect(await title.textContent()).toBe('this is a new page');

  await clickPageMoreActions(page);
  const menusEdgelessItem = page.getByTestId('editor-option-menu-edgeless');
  await menusEdgelessItem.click({ delay: 100 });

  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);
  const docItem = page.locator(
    `[data-testid="page-list-item"]:has-text("this is a new page")`
  );
  expect(docItem).not.toBeUndefined();
  await docItem.click();

  await waitForEditorLoad(page);
  const edgeless = page.locator('affine-edgeless-root');
  await expect(edgeless).toBeVisible();
});

test('Able to insert the title of an untitled page', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  const titleBarTextContent = page.getByTestId('title-edit-button');
  await titleBarTextContent.dblclick({ delay: 100 });
  const titleContent = page.getByTestId('title-content');
  await titleContent.fill('test');
  await titleContent.blur();
  expect(await titleBarTextContent.textContent()).toBe('test');
});

test('Able to edit the title of an existing page', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  const titleBarTextContent = page.getByTestId('title-edit-button');
  await titleBarTextContent.dblclick({ delay: 100 });
  const titleContent = page.getByTestId('title-content');
  await titleContent.fill('test');
  await titleContent.blur();
  expect(await titleBarTextContent.textContent()).toBe('test');
  await titleBarTextContent.dblclick({ delay: 100 });
  await titleContent.fill('Sample text 2');
  await titleContent.blur();
  expect(await titleBarTextContent.textContent()).toBe('Sample text 2');
});

test('Clearing out the title bar will remove the page title', async ({
  page,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  const titleBarTextContent = page.getByTestId('title-edit-button');
  await titleBarTextContent.dblclick({ delay: 100 });
  const titleContent = page.getByTestId('title-content');
  await titleContent.fill('test');
  await titleContent.blur();
  expect(await titleBarTextContent.textContent()).toBe('test');
  await titleBarTextContent.dblclick({ delay: 100 });
  await titleContent.fill('');
  await titleContent.blur();
  expect(await titleBarTextContent.textContent()).toBe('Untitled');
});

test('Rename by editor header items, save with shortcut', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickPageMoreActions(page);
  const menusRenameItem = page.getByTestId('editor-option-menu-rename');
  await menusRenameItem.click({ delay: 100 });
  const titleBarTextContent = page.getByTestId('title-edit-button');
  const titleContent = page.getByTestId('title-content');
  await titleContent.fill('test');
  await page.keyboard.press('Enter');
  expect(await titleBarTextContent.textContent()).toBe('test');
  await clickPageMoreActions(page);
  await menusRenameItem.click({ delay: 100 });
  await titleContent.fill('');
  await page.keyboard.press('Escape');
  expect(await titleBarTextContent.textContent()).toBe('Untitled');
});
