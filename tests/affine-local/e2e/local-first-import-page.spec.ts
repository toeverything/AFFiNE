import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickPageMoreActions,
  waitEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('Click import page item', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await clickPageMoreActions(page);
  const importItem = page.getByTestId('editor-option-menu-import');
  await importItem.click();
  const importModal = page.locator('import-page');

  expect(await importModal.isVisible()).toBe(true);
});
