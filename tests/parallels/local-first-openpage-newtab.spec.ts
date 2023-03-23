import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { getBlockSuiteEditorTitle, newPage } from '../libs/page-logic';
import { test } from '../libs/playwright';
import { assertCurrentWorkspaceFlavour } from '../libs/workspace';

test.describe('local first new page', () => {
  test('click btn bew page and open in tab', async ({ page }) => {
    await openHomePage(page);
    await newPage(page);
    await getBlockSuiteEditorTitle(page).click();
    await getBlockSuiteEditorTitle(page).fill('this is a new page');
    const newPageUrl = page.url();
    const newPageId = page.url().split('/').reverse()[0];

    await page.getByRole('link', { name: 'All pages' }).click();

    await page
      .getByTestId('more-actions-' + newPageId)
      .getByRole('button')
      .first()
      .click();
    const [newTabPage] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Open in new tab' }).click(),
    ]);

    expect(newTabPage.url()).toBe(newPageUrl);
    await assertCurrentWorkspaceFlavour('local', page);
  });
});
