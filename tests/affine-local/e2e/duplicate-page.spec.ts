import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickPageMoreActions,
  getBlockSuiteEditorTitle,
  newPage,
  waitEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('Duplicate page should work', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  const title = getBlockSuiteEditorTitle(page);
  await title.type('test');
  await clickPageMoreActions(page);
  const duplicateButton = page.getByTestId('editor-option-menu-duplicate');
  await duplicateButton.click({ delay: 100 });
  const title2 = getBlockSuiteEditorTitle(page);
  expect(await title2.innerText()).toBe('test(1)');
});
