import { test } from '@affine-test/kit/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { openHomePage } from '../../libs/load-page';
import { newPage, waitEditorLoad } from '../../libs/page-logic';
const addDatabase = async (page: Page) => {
  await page.keyboard.press('/', { delay: 50 });
  await page.keyboard.press('d');
  await page.keyboard.press('a');
  await page.keyboard.press('t');
  await page.keyboard.press('a');
  await page.keyboard.press('b');
  await page.keyboard.press('a', { delay: 50 });
  await page.keyboard.press('Enter', { delay: 50 });
};

test('database is useable', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await page.keyboard.insertText('test title');
  await page.keyboard.press('Enter');
  const title = page.locator('.affine-default-page-block-title');
  expect(await title.innerText()).toBe('test title');
  await addDatabase(page);
  const database = page.locator('.affine-database-table');
  await expect(database).toBeVisible();
  await page.reload();
  await waitEditorLoad(page);
  await newPage(page);
  await page.keyboard.insertText('test title2');
  await page.keyboard.press('Enter');
  const title2 = page.locator('.affine-default-page-block-title');
  expect(await title2.innerText()).toBe('test title2');
  await addDatabase(page);
  const database2 = page.locator('.affine-database-table');
  await expect(database2).toBeVisible();
});

test('link page is useable', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await page.keyboard.insertText('page1');
  await page.keyboard.press('Enter');
  const title = page.locator('.affine-default-page-block-title');
  expect(await title.innerText()).toBe('page1');
  await newPage(page);
  await page.keyboard.insertText('page2');
  await page.keyboard.press('Enter');
  const title2 = page.locator('.affine-default-page-block-title');
  expect(await title2.innerText()).toBe('page2');
  await page.keyboard.press('@', { delay: 50 });
  await page.keyboard.press('p');
  await page.keyboard.press('a');
  await page.keyboard.press('g');
  await page.keyboard.press('e');
  await page.keyboard.press('1');
  await page.keyboard.press('Enter');
  const link = page.locator('.affine-reference');
  expect(link).toBeVisible();
  await page.click('.affine-reference');
  expect(await title.innerText()).toBe('page1');
});
