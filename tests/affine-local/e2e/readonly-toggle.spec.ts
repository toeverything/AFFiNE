import { test } from '@affine-test/kit/playwright';
import { pressEnter } from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('toggle read-only mode disables body and title editing, re-enables them, and resets when navigating to another doc', async ({
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

  const headerTitle = page.getByTestId('title-edit-button');
  const headerTitleInput = page.getByTestId('title-content');
  const toggleButton = page.getByTestId('readonly-toggle-button');
  await toggleButton.click();

  // body and header title should not accept edits while read-only
  await paragraph.click();
  await type(page, ' should not appear');
  await expect(paragraph).toContainText('before toggle');
  await expect(paragraph).not.toContainText('should not appear');

  await headerTitle.dblclick();
  await expect(headerTitleInput).toHaveCount(0);
  await expect(headerTitle).toHaveText('Readonly Toggle Doc A');

  // toggle back to editing
  await toggleButton.click();
  await paragraph.click();
  await type(page, ' after toggle');
  await expect(paragraph).toContainText('before toggle after toggle');

  await headerTitle.dblclick();
  await expect(headerTitleInput).toBeVisible();
  await headerTitleInput.fill('Readonly Toggle Doc A Edited');
  await headerTitleInput.press('Enter');
  await expect(headerTitle).toHaveText('Readonly Toggle Doc A Edited');

  // re-enter read-only before navigating to verify the state resets on the next doc
  await toggleButton.click();
  await headerTitle.dblclick();
  await expect(headerTitleInput).toHaveCount(0);

  await clickNewPageButton(page, 'Readonly Toggle Doc B');
  await waitForEditorLoad(page);
  await pressEnter(page);
  await type(page, 'doc b content');

  const paragraphB = page.locator('affine-paragraph rich-text').first();
  await expect(paragraphB).toContainText('doc b content');
});
