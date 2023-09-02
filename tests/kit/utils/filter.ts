import type { Page } from '@playwright/test';
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
  await page
    .locator('[data-testid="header"]')
    .locator('button', { hasText: 'Filter' })
    .click();
  await page
    .locator('[data-testid="variable-select-item"]', { hasText: name })
    .click();
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

export const checkPagesCount = async (page: Page, count: number) => {
  expect((await page.locator('[data-testid="title"]').all()).length).toBe(
    count
  );
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

const clickMonthPicker = async (page: Page) => {
  await page.locator('[data-testid="month-picker-button"]').click();
};

export const fillDatePicker = async (page: Page, date: Date) => {
  await page
    .locator('[data-testid="filter-arg"]')
    .locator('input')
    .fill(dateFormat(date));
};

const checkIsLastMonth = (date: Date): boolean => {
  const targetMonth = date.getMonth();
  const currentMonth = new Date().getMonth();
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  return targetMonth === lastMonth;
};

const checkIsNextMonth = (date: Date): boolean => {
  const targetMonth = date.getMonth();
  const currentMonth = new Date().getMonth();
  const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
  return targetMonth === nextMonth;
};

export const selectDateFromDatePicker = async (page: Page, date: Date) => {
  const datePickerPopup = page.locator('.react-datepicker-popper');
  const day = date.getDate();
  const month = date.toLocaleString('en-US', { month: 'long' });
  const weekday = date.toLocaleString('en-US', { weekday: 'long' });
  const year = date.getFullYear().toString();
  const nth = function (d: number) {
    if (d > 3 && d < 21) return 'th';
    switch (d % 10) {
      case 1:
        return 'st';
      case 2:
        return 'nd';
      case 3:
        return 'rd';
      default:
        return 'th';
    }
  };
  const daySuffix = nth(day);
  // Open the date picker popup
  await clickDatePicker(page);
  const selectDate = async (): Promise<void> => {
    if (checkIsLastMonth(date)) {
      const lastMonthButton = page.locator(
        '[data-testid="date-picker-prev-button"]'
      );
      await lastMonthButton.click();
    } else if (checkIsNextMonth(date)) {
      const nextMonthButton = page.locator(
        '[data-testid="date-picker-next-button"]'
      );
      await nextMonthButton.click();
    }
    // Click on the day cell
    const dateCell = page.locator(
      `[aria-disabled="false"][aria-label="Choose ${weekday}, ${month} ${day}${daySuffix}, ${year}"]`
    );
    await dateCell.click();
  };
  await selectDate();

  // Wait for the date picker popup to close
  await datePickerPopup.waitFor({ state: 'hidden' });
};

const checkIsLastYear = (date: Date): boolean => {
  const targetYear = date.getFullYear();
  const currentYear = new Date().getFullYear();
  const lastYear = currentYear - 1;
  return targetYear === lastYear;
};

const checkIsNextYear = (date: Date): boolean => {
  const targetYear = date.getFullYear();
  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  return targetYear === nextYear;
};

export const selectMonthFromMonthPicker = async (page: Page, date: Date) => {
  const month = date.toLocaleString('en-US', { month: 'long' });
  const year = date.getFullYear().toString();
  // Open the month picker popup
  await clickMonthPicker(page);
  const selectMonth = async (): Promise<void> => {
    if (checkIsLastYear(date)) {
      const lastYearButton = page.locator(
        '[data-testid="month-picker-prev-button"]'
      );
      await lastYearButton.click();
    } else if (checkIsNextYear(date)) {
      const nextYearButton = page.locator(
        '[data-testid="month-picker-next-button"]'
      );
      await nextYearButton.click();
    }
    // Click on the day cell
    const monthCell = page.locator(`[aria-label="Choose ${month} ${year}"]`);
    await monthCell.click();
  };
  await selectMonth();
};

export const checkDatePickerMonth = async (page: Page, date: Date) => {
  expect(
    await page.locator('[data-testid="date-picker-current-month"]').innerText()
  ).toBe(date.toLocaleString('en-US', { month: 'long' }));
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
  await page.locator('affine-page-meta-data').click();
  await page.locator('.add-tag').click();
  for (const name of options.tags) {
    await createTag(page, name);
  }
  await page.keyboard.press('Escape');
};

export const changeFilter = async (page: Page, to: string | RegExp) => {
  await page.getByTestId('filter-name').click();
  await page
    .getByTestId('filter-name-select')
    .locator('button', { hasText: to })
    .click();
};

export async function selectTag(page: Page, name: string | RegExp) {
  await page.getByTestId('filter-arg').click();
  await page
    .getByTestId('multi-select')
    .getByTestId('select-option')
    .getByText(name, { exact: true })
    .click();
  await page.getByTestId('filter-arg').click();
}
