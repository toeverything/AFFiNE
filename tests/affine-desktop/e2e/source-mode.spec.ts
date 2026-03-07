/**
 * T074 — Source mode round-trip E2E test.
 *
 * Verifies: live preview → source mode → edit raw markdown → switch back →
 * content preserved. Covers contracts §6 / FR-044, FR-045, FR-049, FR-050c.
 */
import { test } from '@affine-test/kit/electron';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('source mode: round-trip preserves content', async ({ page }) => {
  // 1. Create a new page and type some content.
  await clickNewPageButton(page);
  const title = getBlockSuiteEditorTitle(page);
  await title.focus();
  await title.pressSequentially('Source Mode Test', { delay: 50 });

  // Focus the editor body and type a paragraph with bold.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Hello **world**');
  await page.keyboard.press('Space'); // trigger bold shortcut

  // 2. Click the source mode toggle button.
  const toggleButton = page.getByTestId('source-mode-toggle');
  await expect(toggleButton).toBeVisible();
  await toggleButton.click();

  // 3. Source mode editor should appear and contain markdown.
  const textarea = page.getByTestId('source-mode-textarea');
  await expect(textarea).toBeVisible();
  await expect(textarea).toBeFocused();

  const initialMarkdown = await textarea.inputValue();
  expect(initialMarkdown).toContain('**world**');

  // 4. Edit the raw markdown — add a new line.
  await textarea.fill(initialMarkdown + '\n\nAdded in source mode.');

  // 5. Apply changes (Ctrl+Enter).
  await textarea.press('Control+Enter');

  // 6. Source editor should disappear and live preview should show.
  await expect(textarea).not.toBeVisible();
  await expect(page.getByTestId('source-mode-editor')).not.toBeVisible();

  // 7. The new content should appear in the document.
  const editorContent = page
    .locator('.affine-rich-text, affine-rich-text')
    .first();
  await expect(editorContent).toContainText('Added in source mode.');
});

test('source mode: cancel discards edits', async ({ page }) => {
  await clickNewPageButton(page);
  const title = getBlockSuiteEditorTitle(page);
  await title.focus();
  await title.pressSequentially('Cancel Test', { delay: 50 });
  await page.keyboard.press('Enter');
  await page.keyboard.type('Original content');

  // Enter source mode.
  await page.getByTestId('source-mode-toggle').click();
  const textarea = page.getByTestId('source-mode-textarea');
  await expect(textarea).toBeVisible();

  // Overwrite with different content.
  await textarea.fill('Completely replaced content');

  // Cancel — should exit without applying.
  await page.getByTestId('source-mode-cancel-button').click();
  await expect(textarea).not.toBeVisible();

  // Original content should still be present.
  const editorContent = page
    .locator('.affine-rich-text, affine-rich-text')
    .first();
  await expect(editorContent).toContainText('Original content');
});

test('source mode: toggle button has correct aria-pressed state', async ({
  page,
}) => {
  await clickNewPageButton(page);
  const toggle = page.getByTestId('source-mode-toggle');

  // Initially not in source mode.
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  // Enter source mode.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('source-mode-editor')).toBeVisible();

  // Exit via cancel.
  await page.getByTestId('source-mode-cancel-button').click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
});
