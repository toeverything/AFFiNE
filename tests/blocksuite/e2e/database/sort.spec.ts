import { expect, type Locator } from '@playwright/test';

import {
  enterPlaygroundRoom,
  initDatabaseDynamicRowWithData,
  initEmptyDatabaseState,
  waitNextFrame,
} from '../utils/actions/index.js';
import { test } from '../utils/playwright.js';
import { initDatabaseColumn, switchColumnType } from './actions.js';

test('database sort with multiple rules', async ({ page }) => {
  // Initialize database
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  // Add test columns: Name (text) and Age (number)
  await initDatabaseColumn(page, 'Name');
  await switchColumnType(page, 'Text', 1);
  await initDatabaseColumn(page, 'Age');
  await switchColumnType(page, 'Number', 2);

  // Add test data
  const testData = [
    { name: 'Alice', age: '25' },
    { name: 'Bob', age: '30' },
    { name: 'Alice', age: '20' },
    { name: 'Charlie', age: '25' },
  ];

  for (const data of testData) {
    await initDatabaseDynamicRowWithData(page, data.name, true, 0);
    await initDatabaseDynamicRowWithData(page, data.age, false, 1);
  }

  // Open sort menu
  const sortButton = page.locator('data-view-header-tools-sort');
  await sortButton.click();

  // Add first sort rule: Name ascending
  await page.locator('affine-menu').getByText('Name').click();
  await waitNextFrame(page);

  // Add second sort rule: Age ascending
  await page.getByText('Add sort').click();
  await page.locator('affine-menu').getByText('Age').click();
  await waitNextFrame(page);

  // Get all rows after sorting
  const rows = await page.locator('affine-database-row').all();
  const getCellText = async (row: Locator, index: number) => {
    const cell = row.locator('.cell').nth(index);
    return cell.innerText();
  };

  // Verify sorting results
  // Should be sorted by Name first, then by Age
  const expectedOrder = [
    { name: 'Alice', age: '20' },
    { name: 'Alice', age: '25' },
    { name: 'Bob', age: '30' },
    { name: 'Charlie', age: '25' },
  ];

  for (let i = 0; i < rows.length; i++) {
    const name = await getCellText(rows[i], 1);
    const age = await getCellText(rows[i], 2);
    expect(name).toBe(expectedOrder[i].name);
    expect(age).toBe(expectedOrder[i].age);
  }

  // Change sort order of Name to descending
  await page.locator('.sort-item').first().getByText('Ascending').click();
  await page.getByText('Descending').click();
  await waitNextFrame(page);

  // Verify new sorting results
  const expectedOrderDesc = [
    { name: 'Charlie', age: '25' },
    { name: 'Bob', age: '30' },
    { name: 'Alice', age: '20' },
    { name: 'Alice', age: '25' },
  ];

  const rowsAfterDesc = await page.locator('affine-database-row').all();
  for (let i = 0; i < rowsAfterDesc.length; i++) {
    const name = await getCellText(rowsAfterDesc[i], 1);
    const age = await getCellText(rowsAfterDesc[i], 2);
    expect(name).toBe(expectedOrderDesc[i].name);
    expect(age).toBe(expectedOrderDesc[i].age);
  }

  // Remove first sort rule
  await page.locator('.sort-item').first().getByRole('img').last().click();
  await waitNextFrame(page);

  // Verify sorting now only by Age
  const expectedOrderAgeOnly = [
    { name: 'Alice', age: '20' },
    { name: 'Alice', age: '25' },
    { name: 'Charlie', age: '25' },
    { name: 'Bob', age: '30' },
  ];

  const rowsAfterRemove = await page.locator('affine-database-row').all();
  for (let i = 0; i < rowsAfterRemove.length; i++) {
    const name = await getCellText(rowsAfterRemove[i], 1);
    const age = await getCellText(rowsAfterRemove[i], 2);
    expect(name).toBe(expectedOrderAgeOnly[i].name);
    expect(age).toBe(expectedOrderAgeOnly[i].age);
  }
});
