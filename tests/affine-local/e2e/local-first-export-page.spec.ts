import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickPageMoreActions,
  getBlockSuiteEditorTitle,
  newPage,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test.skip('New a page ,then open it and export html', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await page
    .getByPlaceholder('Title')
    .fill('this is a new page to export html content');
  await page.getByTestId('all-pages').click();

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
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});

test.skip('New a page ,then open it and export markdown', async ({
  page,
  workspace,
}) => {
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await page
    .getByPlaceholder('Title')
    .fill('this is a new page to export markdown content');
  await page.getByTestId('all-pages').click();
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
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});
