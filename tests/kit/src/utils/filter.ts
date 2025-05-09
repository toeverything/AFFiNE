import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { clickNewPageButton, getBlockSuiteEditorTitle } from './page-logic';

const monthNames = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export const createFirstFilter = async (page: Page, name: string) => {
  await page.locator('[data-testid="create-first-filter"]').click();
  await page
    .locator('[data-testid="variable-select-item"]', { hasText: name })
    .click();
  await page.keyboard.press('Escape');
};

export const checkFilterName = async (page: Page, name: string) => {
  const filterName = await page
    .locator('[data-testid="filter-name"]')
    .textContent();
  expect(filterName).toBe(name);
};

const dateFormat = (date: Date) => {
  const month = monthNames[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  return `${month} ${day}`;
};

// fixme: there could be multiple page lists in the Page
export const getPagesCount = async (page: Page) => {
  const locator = page.locator('[data-testid="virtualized-page-list"]');
  const pageListCount = await locator.count();

  if (pageListCount === 0) {
    return 0;
  }

  // locator is not a HTMLElement, so we can't use dataset
  // oxlint-disable-next-line unicorn/prefer-dom-node-dataset
  const count = await locator.getAttribute('data-total-count');
  return count ? parseInt(count) : 0;
};

export const checkDatePicker = async (page: Page, date: Date) => {
  expect(
    await page
      .locator('[data-testid="filter-arg"]')
      .locator('input')
      .inputValue()
  ).toBe(dateFormat(date));
};

export const clickDatePicker = async (page: Page) => {
  await page.locator('[data-testid="filter-arg"]').locator('input').click();
};

const clickMonthPicker = async (page: Page | Locator) => {
  await page.locator('[data-testid="month-picker-button"]').click();
};

export const fillDatePicker = async (page: Page, date: Date) => {
  await page
    .locator('[data-testid="filter-arg"]')
    .locator('input')
    .fill(dateFormat(date));
};

export const selectMonthFromMonthPicker = async (
  page: Page | Locator,
  date: Date
) => {
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  // Open the month picker popup
  await clickMonthPicker(page);
  const selectMonth = async (): Promise<void> => {
    const selectedYear = +(await page
      .getByTestId('month-picker-current-year')
      .innerText());
    if (selectedYear > year) {
      await page.locator('[data-testid="date-picker-nav-prev"]').click();
      return await selectMonth();
    } else if (selectedYear < year) {
      await page.locator('[data-testid="date-picker-nav-next"]').click();
      return await selectMonth();
    }
    // Click on the day cell
    const monthCell = page.locator(
      `[data-is-month-cell][aria-label="${year}-${month}"]`
    );
    await monthCell.click();
  };
  await selectMonth();
};

export const checkDatePickerMonth = async (
  page: Page | Locator,
  date: Date
) => {
  expect(
    await page.getByTestId('month-picker-button').evaluate(e => e.dataset.month)
  ).toBe(date.getMonth().toString());
};

const createTag = async (page: Page, name: string) => {
  await page.keyboard.type(name);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
};

export const createPageWithTag = async (
  page: Page,
  options: {
    title: string;
    tags: string[];
  }
) => {
  await page.getByTestId('all-pages').click();
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('test page');
  await page.getByTestId('page-info-collapse').click();
  await page.locator('[data-testid="property-tags-value"]').click();
  for (const name of options.tags) {
    await createTag(page, name);
  }
  await page.keyboard.press('Escape');
};

export const changeFilter = async (page: Page, to: string) => {
  await page.getByTestId('filter-name').click();
  await page.getByTestId(`filler-tag-${to}`).click();
};

export async function selectTag(page: Page, name: string | RegExp) {
  await page.getByTestId('filter-arg').click();
  await page.getByTestId(`multi-select-${name}`).click();
  await page.keyboard.press('Escape', { delay: 100 });
}
