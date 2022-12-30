import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe.skip('Local first export page', () => {
  test('New a page ,then open it and export html', async ({ page }) => {
    await page.getByText('New Page').click();
    await page.getByPlaceholder('Title').click();
    await page
      .getByPlaceholder('Title')
      .fill('this is a new page to export html content');
    await page.getByRole('link', { name: 'All pages' }).click();

    const cell = page.getByRole('cell', {
      name: 'this is a new page to export html content',
    });
    expect(cell).not.toBeUndefined();

    await cell.click();
    await page
      .getByTestId('editor-header-items')
      .getByRole('button')
      .nth(2)
      .click();
    const exportParentBtn = page.getByRole('tooltip', {
      name: 'Add to favourites Convert to Edgeless Export Delete',
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

  test('New a page ,then open it and export markdown', async ({ page }) => {
    await page.getByText('New Page').click();
    await page.getByPlaceholder('Title').click();
    await page
      .getByPlaceholder('Title')
      .fill('this is a new page to export markdown content');
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', {
      name: 'this is a new page to export markdown content',
    });
    expect(cell).not.toBeUndefined();

    await cell.click();
    await page
      .getByTestId('editor-header-items')
      .getByRole('button')
      .nth(2)
      .click();
    const exportParentBtn = page.getByRole('tooltip', {
      name: 'Add to favourites Convert to Edgeless Export Delete',
    });
    await exportParentBtn.click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export to Markdown' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(
      'this is a new page to export markdown content.md'
    );
  });
});
