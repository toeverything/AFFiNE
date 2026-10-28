import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  createLinkedPage,
  getBlockSuiteEditorTitle,
  type,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
});

async function openNewChildDoc(page: Page, child: string) {
  await getBlockSuiteEditorTitle(page).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await createLinkedPage(page, child);
  await page.locator('affine-reference').filter({ hasText: child }).click();
  await expect(getBlockSuiteEditorTitle(page)).toHaveText(child);
}

test('shows linking docs as breadcrumb and navigates back to the parent', async ({
  page,
}) => {
  await getBlockSuiteEditorTitle(page).click();
  await type(page, 'Parent Doc');
  await openNewChildDoc(page, 'Child Doc');

  const breadcrumb = page.getByTestId('doc-breadcrumb');
  await expect(breadcrumb).toBeVisible();
  const items = breadcrumb.getByTestId('doc-breadcrumb-item');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toHaveText('Parent Doc');

  await items.first().click();
  await expect(getBlockSuiteEditorTitle(page)).toHaveText('Parent Doc');
  // the parent doc is not linked from any other doc
  await expect(page.getByTestId('doc-breadcrumb')).toHaveCount(0);
});

test('shows the full chain of linking docs', async ({ page }) => {
  await getBlockSuiteEditorTitle(page).click();
  await type(page, 'Root Doc');
  await openNewChildDoc(page, 'Middle Doc');
  await openNewChildDoc(page, 'Leaf Doc');

  const items = page
    .getByTestId('doc-breadcrumb')
    .getByTestId('doc-breadcrumb-item');
  await expect(items).toHaveText(['Root Doc', 'Middle Doc']);
});
