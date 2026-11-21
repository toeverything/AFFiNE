import { expect, type Page } from '@playwright/test';

import {
  enterPlaygroundRoom,
  initDatabaseDynamicRowWithData,
  initEmptyDatabaseState,
  waitNextFrame,
} from '../utils/actions/index.js';
import { test } from '../utils/playwright.js';
import {
  getDatabaseHeaderColumn,
  initDatabaseColumn,
  switchColumnType,
} from './actions.js';

const formulaEditor = (page: Page) =>
  page.locator('affine-database-formula-editor');

const formulaCells = (page: Page) =>
  page.locator('affine-database-formula-cell');

const initPriceAndFormula = async (page: Page, prices: string[]) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);
  await initDatabaseColumn(page, 'Price');
  await switchColumnType(page, 'Number', 1);
  for (const price of prices) {
    await initDatabaseDynamicRowWithData(page, price, true, 0);
  }
  await initDatabaseColumn(page, 'Total');
  await switchColumnType(page, 'Formula', 2);
};

const saveFormula = async (page: Page, expression: string) => {
  const editor = formulaEditor(page);
  await editor.locator('textarea').fill(expression);
  await editor.getByTestId('formula-editor-save').click();
  await expect(editor).toHaveCount(0);
  await waitNextFrame(page);
};

const openFormulaEditor = async (page: Page, columnIndex: number) => {
  const { column } = await getDatabaseHeaderColumn(page, columnIndex);
  await column.click();
  await page
    .locator('.affine-menu-button', { hasText: 'Edit formula' })
    .click();
  await expect(formulaEditor(page)).toBeVisible();
};

test.describe('formula column', () => {
  test('calculates values from other columns', async ({ page }) => {
    await initPriceAndFormula(page, ['3', '4.5']);

    // switching a column to formula opens the editor
    const editor = formulaEditor(page);
    await expect(editor).toBeVisible();
    await editor.locator('textarea').fill('prop("Price") * 2');
    await expect(editor.getByTestId('formula-editor-preview')).toHaveText('6');
    await editor.getByTestId('formula-editor-save').click();
    await expect(editor).toHaveCount(0);

    await expect(formulaCells(page)).toHaveText(['6', '9']);

    // editing a referenced cell (the last row's price) updates the formula
    await initDatabaseDynamicRowWithData(page, '10', false, 0);
    await expect(formulaCells(page)).toHaveText(['6', '20']);
  });

  test('keeps working after renaming a referenced column', async ({ page }) => {
    await initPriceAndFormula(page, ['3']);
    await saveFormula(page, 'prop("Price") + 1');
    await expect(formulaCells(page)).toHaveText(['4']);

    const { column } = await getDatabaseHeaderColumn(page, 1);
    await column.click();
    const nameInput = page.locator('affine-menu input.affine-menu-input');
    await nameInput.fill('Unit price');
    await nameInput.press('Enter');
    await page.keyboard.press('Escape');
    await waitNextFrame(page);

    await expect(formulaCells(page)).toHaveText(['4']);
    await openFormulaEditor(page, 2);
    await expect(formulaEditor(page).locator('textarea')).toHaveValue(
      'prop("Unit price") + 1'
    );
  });

  test('reports errors', async ({ page }) => {
    await initPriceAndFormula(page, ['0', '5']);
    const editor = formulaEditor(page);

    await editor.locator('textarea').fill('prop("Price") +');
    await expect(editor.getByTestId('formula-editor-error')).toBeVisible();
    await expect(editor.getByTestId('formula-editor-save')).toBeDisabled();

    await saveFormula(page, '10 / prop("Price")');
    await expect(formulaCells(page)).toHaveText(['Error', '2']);
    await expect(formulaCells(page).first().locator('span')).toHaveAttribute(
      'title',
      'Division by zero'
    );
  });
});
