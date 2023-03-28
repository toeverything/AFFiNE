import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import {
  getBlockSuiteEditorTitle,
  newPage,
  waitMarkdownImported,
} from '../libs/page-logic';
import { test } from '../libs/playwright';
import { assertCurrentWorkspaceFlavour } from '../libs/workspace';

test.describe('local first new page', () => {
  test('click btn new page', async ({ page }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
    const originPageId = page.url().split('/').reverse()[0];
    await newPage(page);
    const newPageId = page.url().split('/').reverse()[0];
    expect(newPageId).not.toBe(originPageId);
    await assertCurrentWorkspaceFlavour('local', page);
  });

  test('click btn bew page and find it in all pages', async ({ page }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
    await newPage(page);
    await getBlockSuiteEditorTitle(page).click();
    await getBlockSuiteEditorTitle(page).fill('this is a new page');
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', { name: 'this is a new page' });
    expect(cell).not.toBeUndefined();
    await assertCurrentWorkspaceFlavour('local', page);
  });
});
