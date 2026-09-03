import { test } from '@affine-test/kit/playwright';
import { pressEnter } from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('toggle read-only mode disables editing, re-enables it, and resets when navigating to another doc', async ({
  page,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);

  await clickNewPageButton(page, 'Readonly Toggle Doc A');
  await waitForEditorLoad(page);
  await pressEnter(page);
  await type(page, 'before toggle');

  const paragraph = page.locator('affine-paragraph rich-text').first();
  await expect(paragraph).toContainText('before toggle');

  const toggleButton = page.getByTestId('readonly-toggle-button');
  await toggleButton.click();

  // body should not accept edits while read-only
  await paragraph.click();
  await type(page, ' should not appear');
  await expect(paragraph).toContainText('before toggle');
  await expect(paragraph).not.toContainText('should not appear');

  // toggle back to editing
  await toggleButton.click();
  await paragraph.click();
  await type(page, ' after toggle');
  await expect(paragraph).toContainText('before toggle after toggle');

  // navigating to a different doc must not leak the read-only state
  await clickNewPageButton(page, 'Readonly Toggle Doc B');
  await waitForEditorLoad(page);
  await pressEnter(page);
  await type(page, 'doc b content');

  const paragraphB = page.locator('affine-paragraph rich-text').first();
  await expect(paragraphB).toContainText('doc b content');
});
