import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  addCodeBlock,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import {
  closeSettingModal,
  openEditorSetting,
} from '@affine-test/kit/utils/setting';
import { expect, type Page } from '@playwright/test';

import { initCodeBlockByOneStep, openCodeBlockMoreMenu } from './utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Opens Editor Settings and returns a locator for the
 * "Show line numbers in code blocks" toggle switch.
 */
async function openLineNumbersSetting(page: Page) {
  await openEditorSetting(page);
  return page.getByTestId('code-block-line-numbers-trigger');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Global code block line numbers setting', () => {
  test('line numbers are visible by default', async ({ page }) => {
    await initCodeBlockByOneStep(page);

    const lineNumber = page.locator('affine-code .line-number');
    await expect(lineNumber).toBeVisible();
  });

  test('global toggle hides line numbers on all existing code blocks', async ({
    page,
  }) => {
    await initCodeBlockByOneStep(page);

    const lineNumber = page.locator('affine-code .line-number');
    await expect(lineNumber).toBeVisible();

    // Turn the global setting OFF
    const toggle = await openLineNumbersSetting(page);
    await expect(toggle).toBeVisible();
    await toggle.click();
    await closeSettingModal(page);

    // Line numbers must now be hidden
    await expect(lineNumber).toBeHidden();
  });

  test('turning global toggle back on restores line numbers', async ({
    page,
  }) => {
    await initCodeBlockByOneStep(page);

    const lineNumber = page.locator('affine-code .line-number');

    // OFF
    const toggle = await openLineNumbersSetting(page);
    await toggle.click();
    await closeSettingModal(page);
    await expect(lineNumber).toBeHidden();

    // ON again
    const toggle2 = await openLineNumbersSetting(page);
    await toggle2.click();
    await closeSettingModal(page);
    await expect(lineNumber).toBeVisible();
  });

  test('per-block toggle shows line numbers when global is off', async ({
    page,
  }) => {
    await initCodeBlockByOneStep(page);

    const lineNumber = page.locator('affine-code .line-number');

    // Turn global setting OFF
    const toggle = await openLineNumbersSetting(page);
    await toggle.click();
    await closeSettingModal(page);
    await expect(lineNumber).toBeHidden();

    // Per-block: explicitly enable for this block
    const { lineNumberButton } = await openCodeBlockMoreMenu(page);
    await lineNumberButton.click();
    await expect(lineNumber).toBeVisible();
  });

  test('per-block toggle can hide line numbers when global is on', async ({
    page,
  }) => {
    await initCodeBlockByOneStep(page);

    const lineNumber = page.locator('affine-code .line-number');
    // Global is ON by default
    await expect(lineNumber).toBeVisible();

    // Per-block: hide for this block
    const { cancelLineNumberButton } = await openCodeBlockMoreMenu(page);
    await cancelLineNumberButton.click();
    // Click away to dismiss menu
    await page.mouse.click(300, 300);
    await expect(lineNumber).toBeHidden();

    // Turn global setting OFF and then ON - per-block override persists
    const toggle = await openLineNumbersSetting(page);
    await toggle.click(); // OFF
    await toggle.click(); // ON
    await closeSettingModal(page);
    // Per-block explicitly set to false - still hidden
    await expect(lineNumber).toBeHidden();
  });

  test('global setting is reflected on newly created code blocks', async ({
    page,
  }) => {
    // Start on the home page and disable line numbers globally first
    await openHomePage(page);
    await waitForEditorLoad(page);

    const toggle = await openLineNumbersSetting(page);
    await toggle.click(); // OFF
    await closeSettingModal(page);

    // Now create a fresh code block
    await initCodeBlockByOneStep(page);

    const lineNumber = page.locator('affine-code .line-number');
    await expect(lineNumber).toBeHidden();
  });

  test('global toggle affects all code blocks on the page', async ({
    page,
  }) => {
    await initCodeBlockByOneStep(page);

    // Exit the code block (Mod+Enter creates a paragraph below and moves focus there)
    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+Enter' : 'Control+Enter');
    // Add a second code block in the new paragraph
    await addCodeBlock(page);

    // Both blocks should show line numbers by default
    const lineNumbers = page.locator('affine-code .line-number');
    await expect(lineNumbers).toHaveCount(2);
    await expect(lineNumbers.first()).toBeVisible();
    await expect(lineNumbers.last()).toBeVisible();

    // Turn global OFF - both must hide
    const toggle = await openLineNumbersSetting(page);
    await toggle.click();
    await closeSettingModal(page);

    await expect(lineNumbers.first()).toBeHidden();
    await expect(lineNumbers.last()).toBeHidden();

    // Turn global ON - both must show again
    const toggle2 = await openLineNumbersSetting(page);
    await toggle2.click();
    await closeSettingModal(page);

    await expect(lineNumbers.first()).toBeVisible();
    await expect(lineNumbers.last()).toBeVisible();
  });

  test('global setting persists across page reload', async ({ page }) => {
    await initCodeBlockByOneStep(page);

    const lineNumber = page.locator('affine-code .line-number');
    await expect(lineNumber).toBeVisible();

    // Turn global OFF
    const toggle = await openLineNumbersSetting(page);
    await toggle.click();
    await closeSettingModal(page);
    await expect(lineNumber).toBeHidden();

    // Reload the page - setting must survive
    await page.reload();
    await waitForEditorLoad(page);

    await expect(lineNumber).toBeHidden();
  });
});
