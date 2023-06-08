import { test } from '@affine-test/kit/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { getBlockSuiteEditorTitle, waitEditorLoad } from '../libs/page-logic';
import { clickSideBarAllPageButton } from '../libs/sidebar';

function getAllPage(page: Page) {
  const newPageButton = page
    .locator('table')
    .getByRole('button', { name: 'New Page' });
  const newPageDropdown = newPageButton.locator('svg');
  const edgelessBlockCard = page.locator('table').getByText('New Edgeless');

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
  await waitEditorLoad(page);
  await clickSideBarAllPageButton(page);
});

test('all page can create new page', async ({ page }) => {
  const { clickNewPageButton } = getAllPage(page);
  await openHomePage(page);
  await waitEditorLoad(page);
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
  await waitEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await clickNewEdgelessDropdown();
  await expect(page.locator('affine-edgeless-page')).toBeVisible();
});

const closeDownloadTip = async (page: Page) => {
  await page
    .locator('[data-testid="download-client-tip-close-button"]')
    .click();
};

const createFirstFilter = async (page: Page, name: string) => {
  await page
    .locator('[data-testid="editor-header-items"]')
    .locator('button', { hasText: 'Filter' })
    .click();
  await page
    .locator('[data-testid="variable-select-item"]', { hasText: name })
    .click();
};

const checkFilterName = async (page: Page, name: string) => {
  await expect(
    await page.locator('[data-testid="filter-name"]').textContent()
  ).toBe(name);
};

test('allow creation of filters by favorite', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await closeDownloadTip(page);
  await createFirstFilter(page, 'Is Favourited');
  await page
    .locator('[data-testid="filter-arg"]', { hasText: 'true' })
    .locator('div')
    .click();
  await expect(
    await page.locator('[data-testid="filter-arg"]').textContent()
  ).toBe('false');
});

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

const dateFormat = (date: Date) => {
  const month = monthNames[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  return `${month} ${day}`;
};
const checkPagesCount = async (page: Page, count: number) => {
  await expect((await page.locator('[data-testid="title"]').all()).length).toBe(
    count
  );
};
const checkDatePicker = async (page: Page, date: Date) => {
  expect(
    await page
      .locator('[data-testid="filter-arg"]')
      .locator('input')
      .inputValue()
  ).toBe(dateFormat(date));
};
const clickDatePicker = async (page: Page) => {
  await page.locator('[data-testid="filter-arg"]').locator('input').click();
};
const clickMonthPicker = async (page: Page) => {
  await page.locator('[data-testid="month-picker-button"]').click();
};
const fillDatePicker = async (page: Page, date: Date) => {
  await page
    .locator('[data-testid="filter-arg"]')
    .locator('input')
    .fill(dateFormat(date));
};
test('allow creation of filters by created time', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await closeDownloadTip(page);
  await createFirstFilter(page, 'Created');
  await checkFilterName(page, 'after');
  // init date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await checkDatePicker(page, yesterday);
  await checkPagesCount(page, 1);
  // change date
  const today = new Date();
  await fillDatePicker(page, today);
  await checkPagesCount(page, 0);
  // change filter
  await page.locator('[data-testid="filter-name"]').click();
  await page
    .locator('[data-testid="filter-name-select"]')
    .locator('button', { hasText: 'before' })
    .click();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await fillDatePicker(page, tomorrow);
  await checkDatePicker(page, tomorrow);
  await checkPagesCount(page, 1);
});

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
const selectDateFromDatePicker = async (page: Page, date: Date) => {
  const datePickerPopup = page.locator('.react-datepicker-popper');
  const day = date.getDate().toString();
  const month = date.toLocaleString('en-US', { month: 'long' });
  const weekday = date.toLocaleString('en-US', { weekday: 'long' });
  const year = date.getFullYear().toString();
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
      `[aria-disabled="false"][aria-label="Choose ${weekday}, ${month} ${day}th, ${year}"]`
    );
    await dateCell.click();
  };
  await selectDate();

  // Wait for the date picker popup to close
  await datePickerPopup.waitFor({ state: 'hidden' });
};

test('creation of filters by created time, then click date picker to modify the date', async ({
  page,
}) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await closeDownloadTip(page);
  await createFirstFilter(page, 'Created');
  await checkFilterName(page, 'after');
  // init date
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  await checkDatePicker(page, yesterday);
  await checkPagesCount(page, 1);
  // change date
  const today = new Date();
  await selectDateFromDatePicker(page, today);
  await checkPagesCount(page, 0);
  // change filter
  await page.locator('[data-testid="filter-name"]').click();
  await page
    .locator('[data-testid="filter-name-select"]')
    .locator('button', { hasText: 'before' })
    .click();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  await selectDateFromDatePicker(page, tomorrow);
  await checkDatePicker(page, tomorrow);
  await checkPagesCount(page, 1);
});
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
const selectMonthFromMonthPicker = async (page: Page, date: Date) => {
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
const checkDatePickerMonth = async (page: Page, date: Date) => {
  expect(
    await page.locator('[data-testid="date-picker-current-month"]').innerText()
  ).toBe(date.toLocaleString('en-US', { month: 'long' }));
};
test('use monthpicker to modify the month of datepicker', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await clickSideBarAllPageButton(page);
  await closeDownloadTip(page);
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
