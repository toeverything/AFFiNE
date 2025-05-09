import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import test, { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
});

test('Open import dialog by click root sidebar import button', async ({
  page,
}) => {
  await page.getByTestId('slider-bar-import-button').click();

  const importDialog = page.getByTestId('import-dialog');
  await expect(importDialog).toBeVisible();

  await page.getByTestId('modal-close-button').click();
  await expect(importDialog).not.toBeVisible();
});

test('Open import dialog by click header menu import button', async ({
  page,
}) => {
  await page.getByTestId('header-dropDownButton').click();
  await page.getByTestId('editor-option-menu-import').click();

  const importDialog = page.getByTestId('import-dialog');
  await expect(importDialog).toBeVisible();

  await page.getByTestId('modal-close-button').click();
  await expect(importDialog).not.toBeVisible();
});

test('Open import dialog by @ menu import button', async ({ page }) => {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  await page.keyboard.type('@', { delay: 50 });
  const linkedPagePopover = page.locator('.linked-doc-popover');
  await expect(linkedPagePopover).toBeVisible();

  const importButton = page.locator(
    '.linked-doc-popover icon-button[data-id="import"]'
  );
  await expect(importButton).toBeVisible();
  await importButton.click();

  const importDialog = page.getByTestId('import-dialog');
  await expect(importDialog).toBeVisible();

  await page.getByTestId('modal-close-button').click();
  await expect(importDialog).not.toBeVisible();
});
