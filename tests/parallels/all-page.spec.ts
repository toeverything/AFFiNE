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

const dateFormat = (date: Date) => {
  return `${date.getFullYear()}-${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
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
