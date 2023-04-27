import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import {
  clickPageMoreActions,
  getBlockSuiteEditorTitle,
  newPage,
  waitMarkdownImported,
} from '../libs/page-logic';
import { assertCurrentWorkspaceFlavour } from '../libs/workspace';

test.skip('New a page ,then open it and export html', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await page
    .getByPlaceholder('Title')
    .fill('this is a new page to export html content');
  await page.getByRole('link', { name: 'All pages' }).click();

  const cell = page.getByRole('cell', {
    name: 'this is a new page to export html content',
  });
  expect(cell).not.toBeUndefined();

  await cell.click();
  await clickPageMoreActions(page);
  const exportParentBtn = page.getByRole('tooltip', {
    name: 'Add to favorites Convert to Edgeless Export Delete',
  });
  await exportParentBtn.click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export to HTML' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(
    'this is a new page to export html content.html'
  );
});

test.skip('New a page ,then open it and export markdown', async ({ page }) => {
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await page
    .getByPlaceholder('Title')
    .fill('this is a new page to export markdown content');
  await page.getByRole('link', { name: 'All pages' }).click();
  const cell = page.getByRole('cell', {
    name: 'this is a new page to export markdown content',
  });
  expect(cell).not.toBeUndefined();

  await cell.click();
  await clickPageMoreActions(page);
  const exportParentBtn = page.getByRole('tooltip', {
    name: 'Add to favorites Convert to Edgeless Export Delete',
  });
  await exportParentBtn.click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export to Markdown' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(
    'this is a new page to export markdown content.md'
  );
  await assertCurrentWorkspaceFlavour('local', page);
});
