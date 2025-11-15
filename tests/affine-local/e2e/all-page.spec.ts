/* oxlint-disable unicorn/prefer-dom-node-dataset */
import { test } from '@affine-test/kit/playwright';
import { getPagesCount } from '@affine-test/kit/utils/filter';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getAllPage,
  getBlockSuiteEditorTitle,
  waitForAllPagesLoad,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { expect } from '@playwright/test';

test('all page', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickSideBarAllPageButton(page);
});

test('all page can create new page', async ({ page }) => {
  const { clickNewPageButton } = getAllPage(page);
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await clickNewPageButton();
  const title = getBlockSuiteEditorTitle(page);
  await title.fill('this is a new page');
  await clickSideBarAllPageButton(page);
  const cell = page.getByRole('cell', { name: 'this is a new page' });
  expect(cell).not.toBeUndefined();
});

test('all page can create new edgeless page', async ({ page }) => {
  const { clickNewEdgelessDropdown } = getAllPage(page);
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await clickNewEdgelessDropdown();
  await expect(page.locator('affine-edgeless-root')).toBeVisible();
});

test('enable selection and use ESC to disable selection', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);

  // there should be no checkbox in the page list by default
  expect(
    await page
      .locator('[data-testid="doc-list-item-select"][data-select-mode="true"]')
      .count()
  ).toBe(0);

  // by shift + clicking [data-testid="doc-list-item"], checkboxes should appear
  await page
    .locator('[data-testid="doc-list-item"]')
    .first()
    .click({
      modifiers: ['Shift'],
    });

  // wait for 500ms
  await page.waitForTimeout(500);

  // there should be checkboxes in the page list now
  expect(
    await page
      .locator('[data-testid="doc-list-item-select"][data-select-mode="true"]')
      .count()
  ).toBeGreaterThan(0);

  // esc again, checkboxes should disappear
  await page.keyboard.press('Escape');

  // wait for 500ms
  await page.waitForTimeout(500);

  expect(
    await page
      .locator('[data-testid="doc-list-item-select"][data-select-mode="true"]')
      .count()
  ).toBe(0);
});

test('select two pages and delete', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);

  const pageCount = await getPagesCount(page);

  // by shift + clicking [data-testid="doc-list-item"], checkboxes should appear, and first doc be selected
  await page
    .locator('[data-testid="doc-list-item"]')
    .first()
    .click({
      modifiers: ['Shift'],
    });

  // select the first two pages
  await page.locator('[data-testid="doc-list-item"]').nth(1).click();

  // the floating popover should appear
  await expect(page.locator('[data-testid="floating-toolbar"]')).toBeVisible();
  await expect(page.locator('[data-testid="floating-toolbar"]')).toHaveText(
    '2 doc(s) selected'
  );

  // click delete button
  await page.locator('[data-testid="list-toolbar-delete"]').click();

  // the confirm dialog should appear
  await expect(page.getByText('Delete 2 docs?')).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();

  // check the page count again
  await page.waitForTimeout(300);

  expect(await getPagesCount(page)).toBe(pageCount - 2);
});

test('select three pages with shiftKey and delete', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await clickNewPageButton(page);
  await clickNewPageButton(page);
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);

  const pageCount = await getPagesCount(page);
  await page.keyboard.down('Shift');
  await page.locator('[data-testid="doc-list-item"]').nth(0).click();

  await page.locator('[data-testid="doc-list-item"]').nth(2).click();
  await page.keyboard.up('Shift');

  // the floating popover should appear
  await expect(page.locator('[data-testid="floating-toolbar"]')).toBeVisible();
  await expect(page.locator('[data-testid="floating-toolbar"]')).toHaveText(
    '3 doc(s) selected'
  );

  // click delete button
  await page.locator('[data-testid="list-toolbar-delete"]').click();

  // the confirm dialog should appear
  await expect(page.getByText('Delete 3 docs?')).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();

  // check the page count again
  await page.waitForTimeout(300);

  expect(await getPagesCount(page)).toBe(pageCount - 3);
});

test('create a tag and delete it', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);
  await page.getByTestId('workspace-tags-button').click();

  // create a tag
  await page.getByTestId('all-tags-new-button').click();
  await expect(page.getByTestId('edit-tag-modal')).toBeVisible();
  await page.getByTestId('edit-tag-input').fill('test-tag');
  await page.getByTestId('save-tag').click();

  // check the tag is created
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);
  await page.getByTestId('workspace-tags-button').click();
  const cell = page.getByTestId('tag-list-item').getByText('test-tag');
  await expect(cell).toBeVisible();

  // delete the tag
  await page.getByTestId('tag-item-operation-button').click();
  await page.getByTestId('delete-tag').click();
  await page.getByTestId('confirm-modal-confirm').getByText('Delete').click();
  await page.waitForURL(url => url.pathname.endsWith('tag'));

  const newCell = page.getByTestId('tag-list-item').getByText('test-tag');
  await expect(newCell).not.toBeVisible();
});
