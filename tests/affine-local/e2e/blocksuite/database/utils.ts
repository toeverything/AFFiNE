import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  addDatabase,
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function createNewPage(page: Page) {
  await clickNewPageButton(page);
}

export const gotoContentFromTitle = async (page: Page) => {
  await page.keyboard.press('Enter');
};

export async function createDatabaseBlock(page: Page) {
  await addDatabase(page);
}

export async function addRows(page: Page, rowCount: number) {
  for (let i = 0; i < rowCount; i++) {
    await addDatabaseRow(page);
  }
}

export async function addDatabaseRow(page: Page) {
  const addButton = page.locator('.data-view-table-group-add-row');
  await addButton.click();
}

export async function pasteString(page: Page, data: string) {
  await page.evaluate(data => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', data);
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData,
      bubbles: true,
      cancelable: true,
    });
    const activeElement = document.activeElement;
    if (activeElement) {
      pasteEvent.preventDefault();
      activeElement.dispatchEvent(pasteEvent);
    }
  }, data);
}

export async function selectCell(page: Page, nth: number, editing = true) {
  const firstCell = page.locator('affine-database-cell-container').nth(nth);
  // First click for focus
  await firstCell.click({ delay: 100 });
  // Second click for edit mode
  if (editing) {
    await firstCell.click({ delay: 100 });
  }
  return firstCell;
}

export async function verifyCellContents(
  page: Page,
  expectedContents: string[]
) {
  const cells = page.locator('affine-database-cell-container');
  for (let i = 0; i < expectedContents.length; i++) {
    const cell = cells.nth(i);
    await expect(cell.locator('uni-lit > *:first-child')).toHaveText(
      expectedContents[i]
    );
  }
}

export async function selectColumnType(
  page: Page,
  columnType: string,
  nth: number = 1
) {
  const typeMenu = page.locator('affine-menu').getByText('Type');
  await page.waitForTimeout(100);
  await typeMenu.hover();
  await page.waitForTimeout(100);
  await page.keyboard.type(columnType);
  await page.waitForTimeout(100);
  for (let i = 0; i < nth; i++) {
    await page.keyboard.press('ArrowDown');
  }
  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
}

export async function addColumn(page: Page, type: string, nth: number = 1) {
  await clickAddColumnButton(page);
  await selectColumnType(page, type, nth);
}

export async function clickAddColumnButton(page: Page) {
  const addColumnButton = page.locator('.header-add-column-button');
  await addColumnButton.click();
}

export async function changeColumnType(
  page: Page,
  columnIndex: number,
  columnType: string
) {
  const header = page.locator('affine-database-header-column').nth(columnIndex);
  await header.click();
  await selectColumnType(page, columnType);
}
export const initDatabaseByOneStep = async (page: Page) => {
  await openHomePage(page);
  await createNewPage(page);
  await waitForEditorLoad(page);
  await gotoContentFromTitle(page);
  await createDatabaseBlock(page);
};
