import { test } from '@affine-test/kit/mobile';
import { expect } from '@playwright/test';

import { openTab, pageBack } from './utils';

test('toggle read-only mode disables editing, re-enables it, resets on navigation, and hides in non-editable edgeless mode', async ({
  page,
}) => {
  await openTab(page, 'New Page');
  await expect(page.locator('.affine-page-viewport')).toBeVisible();

  const paragraph = page.locator('affine-paragraph rich-text').first();
  await expect(paragraph).toBeVisible();
  await paragraph.click();
  await page.keyboard.type('before toggle');
  await expect(paragraph).toContainText('before toggle');

  const toggleButton = page.getByTestId('readonly-toggle-button');
  await expect(toggleButton).toBeVisible();
  await toggleButton.click();

  // body should not accept edits while read-only
  await paragraph.click();
  await page.keyboard.type(' should not appear');
  await expect(paragraph).toContainText('before toggle');
  await expect(paragraph).not.toContainText('should not appear');

  // toggle back to editing
  await toggleButton.click();
  await paragraph.click();
  await page.keyboard.type(' after toggle');
  await expect(paragraph).toContainText('before toggle after toggle');

  // re-enter read-only before navigating to verify the state resets on the next doc
  await toggleButton.click();
  await pageBack(page);
  await openTab(page, 'New Page');
  await expect(page.locator('.affine-page-viewport')).toBeVisible();

  const paragraphB = page.locator('affine-paragraph rich-text').first();
  await expect(paragraphB).toBeVisible();
  await paragraphB.click();
  await page.keyboard.type('doc b content');
  await expect(paragraphB).toContainText('doc b content');

  // switching to edgeless mode (where mobile edgeless editing is disabled by default) hides the toggle
  await page.click('[data-testid="detail-page-header-more-button"]');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Default to Edgeless mode' }).click();
  await expect(page.locator('.affine-edgeless-viewport')).toBeVisible();
  await expect(toggleButton).toHaveCount(0);
});
