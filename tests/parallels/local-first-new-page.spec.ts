import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import {
  getBlockSuiteEditorTitle,
  newPage,
  waitEditorLoad,
} from '../libs/page-logic';
import { assertCurrentWorkspaceFlavour } from '../libs/workspace';

test('click btn new page', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const originPageId = page.url().split('/').reverse()[0];
  await newPage(page);
  const newPageId = page.url().split('/').reverse()[0];
  expect(newPageId).not.toBe(originPageId);
  await assertCurrentWorkspaceFlavour('local', page);
});

test('click btn bew page and find it in all pages', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page');
  await page.getByTestId('all-pages').click();
  const cell = page.getByRole('cell', { name: 'this is a new page' });
  expect(cell).not.toBeUndefined();
  await assertCurrentWorkspaceFlavour('local', page);
});
