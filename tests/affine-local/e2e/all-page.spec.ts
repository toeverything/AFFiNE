import { test } from '@affine-test/kit/playwright';
import {
  changeFilter,
  checkDatePicker,
  checkDatePickerMonth,
  checkFilterName,
  clickDatePicker,
  createFirstFilter,
  createPageWithTag,
  fillDatePicker,
  getPagesCount,
  selectDateFromDatePicker,
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
  const newPageButton = page.getByTestId('new-page-button');
  const newPageDropdown = newPageButton.locator('svg');
  const edgelessBlockCard = page.getByTestId('switch-edgeless-mode-button');

  async function clickNewPageButton() {
    return newPageButton.click();
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
  await expect(page.locator('affine-edgeless-page')).toBeVisible();
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

test('allow creation of filters by created time', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);
  const pageCount = await getPagesCount(page);
  expect(pageCount).not.toBe(0);
  await createFirstFilter(page, 'Created');
  await checkFilterName(page, 'after');
  // init date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await checkDatePicker(page, yesterday);
  expect(await getPagesCount(page)).toBe(1);
  // change date
  const today = new Date();
  await fillDatePicker(page, today);
  expect(await getPagesCount(page)).toBe(0);
  // change filter
  await page.getByTestId('filter-name').click();
  await page.getByTestId('filler-tag-before').click();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await fillDatePicker(page, tomorrow);
  await checkDatePicker(page, tomorrow);
  expect(await getPagesCount(page)).toBe(pageCount);
});

test('creation of filters by created time, then click date picker to modify the date', async ({
  page,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);
  const pageCount = await getPagesCount(page);
  expect(pageCount).not.toBe(0);
  await createFirstFilter(page, 'Created');
  await checkFilterName(page, 'after');
  // init date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await checkDatePicker(page, yesterday);
  expect(await getPagesCount(page)).toBe(1);
  // change date
  const today = new Date();
  await selectDateFromDatePicker(page, today);
  expect(await getPagesCount(page)).toBe(0);
  // change filter
  await page.locator('[data-testid="filter-name"]').click();
  await page.getByTestId('filler-tag-before').click();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await selectDateFromDatePicker(page, tomorrow);
  await checkDatePicker(page, tomorrow);
  expect(await getPagesCount(page)).toBe(pageCount);
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
  await clickDatePicker(page);
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
  expect(pagesWithTagsCount).not.toBe(0);
  await createPageWithTag(page, { title: 'Page A', tags: ['A'] });
  await createPageWithTag(page, { title: 'Page B', tags: ['B'] });
  await clickSideBarAllPageButton(page);
  await checkFilterName(page, 'is not empty');
  expect(await getPagesCount(page)).toBe(pagesWithTagsCount + 2);
  await changeFilter(page, 'contains all');
  expect(await getPagesCount(page)).toBe(pageCount + 2);
  await selectTag(page, 'A');
  expect(await getPagesCount(page)).toBe(1);
  await changeFilter(page, 'does not contains all');
  await selectTag(page, 'B');
  expect(await getPagesCount(page)).toBe(pageCount + 1);
});
