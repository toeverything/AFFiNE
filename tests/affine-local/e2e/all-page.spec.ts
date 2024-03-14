/* eslint-disable unicorn/prefer-dom-node-dataset */
import { test } from '@affine-test/kit/playwright';
import {
  changeFilter,
  checkDatePicker,
  checkDatePickerMonth,
  checkFilterName,
  clickDatePicker,
  createFirstFilter,
  createPageWithTag,
  getPagesCount,
  selectMonthFromMonthPicker,
  selectTag,
} from '@affine-test/kit/utils/filter';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForAllPagesLoad,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

function getAllPage(page: Page) {
  const newPageButton = page.getByTestId('new-page-button-trigger');
  const newPageDropdown = newPageButton.locator('svg');
  const edgelessBlockCard = page.getByTestId('new-edgeless-button-in-all-page');

  async function clickNewPageButton() {
    const newPageButton = page.getByTestId('new-page-button-trigger');
    return await newPageButton.click();
  }

  async function clickNewEdgelessDropdown() {
    await newPageDropdown.click();
    await edgelessBlockCard.click();
  }

  return { clickNewPageButton, clickNewEdgelessDropdown };
}

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

test('allow creation of filters by favorite', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await createFirstFilter(page, 'Favourited');
  await page
    .locator('[data-testid="filter-arg"]', { hasText: 'true' })
    .locator('div')
    .click();
  expect(await page.locator('[data-testid="filter-arg"]').textContent()).toBe(
    'false'
  );
});

test('use monthpicker to modify the month of datepicker', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await createFirstFilter(page, 'Created');
  await checkFilterName(page, 'after');
  // init date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await checkDatePicker(page, yesterday);
  // change month
  await clickDatePicker(page);
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  await selectMonthFromMonthPicker(page, lastMonth);
  await checkDatePickerMonth(page, lastMonth);
  // change month
  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  await selectMonthFromMonthPicker(page, nextMonth);
  await checkDatePickerMonth(page, nextMonth);
});

test('allow creation of filters by tags', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);
  const pageCount = await getPagesCount(page);
  expect(pageCount).not.toBe(0);
  await createFirstFilter(page, 'Tags');
  await checkFilterName(page, 'is not empty');
  const pagesWithTags = await page
    .locator('[data-testid="page-list-item"]')
    .all();
  const pagesWithTagsCount = pagesWithTags.length;
  expect(pagesWithTagsCount).toBe(0);
  await createPageWithTag(page, { title: 'Page A', tags: ['Page A'] });
  await createPageWithTag(page, { title: 'Page B', tags: ['Page B'] });
  await clickSideBarAllPageButton(page);
  await createFirstFilter(page, 'Tags');
  await checkFilterName(page, 'is not empty');
  expect(await getPagesCount(page)).toBe(pagesWithTagsCount + 2);
  await changeFilter(page, 'contains all');
  expect(await getPagesCount(page)).toBe(pageCount + 2);
  await selectTag(page, 'Page A');
  expect(await getPagesCount(page)).toBe(1);
  await changeFilter(page, 'does not contains all');
  await selectTag(page, 'Page B');
  expect(await getPagesCount(page)).toBe(pageCount + 1);
});

test('enable selection and use ESC to disable selection', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);

  // there should be no checkbox in the page list by default
  expect(
    await page
      .locator('[data-testid="page-list-item"] [data-testid="affine-checkbox"]')
      .count()
  ).toBe(0);

  // by clicking [data-testid="page-list-header-selection-checkbox"], checkboxes should appear
  await page
    .locator('[data-testid="page-list-header-selection-checkbox"]')
    .click();

  // there should be checkboxes in the page list now
  expect(
    await page
      .locator('[data-testid="page-list-item"] [data-testid="affine-checkbox"]')
      .count()
  ).toBeGreaterThan(0);

  // by ESC, checkboxes should NOT disappear (because it is too early)
  await page.keyboard.press('Escape');

  expect(
    await page
      .locator('[data-testid="page-list-item"] [data-testid="affine-checkbox"]')
      .count()
  ).toBeGreaterThan(0);

  // wait for 300ms
  await page.waitForTimeout(300);

  // esc again, checkboxes should disappear
  await page.keyboard.press('Escape');

  expect(
    await page
      .locator('[data-testid="page-list-item"] [data-testid="affine-checkbox"]')
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

  // by clicking [data-testid="page-list-header-selection-checkbox"], checkboxes should appear
  await page
    .locator('[data-testid="page-list-header-selection-checkbox"]')
    .click();

  // select the first two pages
  await page
    .locator('[data-testid="page-list-item"] [data-testid="affine-checkbox"]')
    .nth(0)
    .click();

  await page
    .locator('[data-testid="page-list-item"] [data-testid="affine-checkbox"]')
    .nth(1)
    .click();

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

test('select a group of items by clicking "Select All" in group header', async ({
  page,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);

  // Select All will appear when hovering the header
  await page.hover('[data-testid="page-list-group-header"]');

  // click Select All
  await page.getByRole('button', { name: 'Select All' }).click();

  const selectedItemCount = await page
    .locator('[data-testid="page-list-group-header"]')
    .getAttribute('data-group-selected-items-count');

  const selectedGroupItemTotalCount = await page
    .locator('[data-testid="page-list-group-header"]')
    .getAttribute('data-group-items-count');
  expect(selectedItemCount).toBe(selectedGroupItemTotalCount);

  // check the selected count is equal to the one displayed in the floating toolbar
  await expect(page.locator('[data-testid="floating-toolbar"]')).toHaveText(
    `${selectedItemCount} doc(s) selected`
  );
});
