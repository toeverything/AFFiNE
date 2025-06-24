import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIBasic/Guidance', () => {
  test.beforeEach(async ({ page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
  });

  test('should show AI panel when space is pressed on empty paragraph', async ({
    page,
    utils,
  }) => {
    await utils.editor.focusToEditor(page);
    await page.keyboard.press('Space');
    await expect(page.locator('affine-ai-panel-widget')).toBeVisible();
  });

  test('should not show AI panel when space is pressed on non-empty paragraph', async ({
    page,
    utils,
  }) => {
    await utils.editor.focusToEditor(page);
    await page.keyboard.insertText('HelloWorld');
    await page.keyboard.press('Space');
    await expect(page.locator('affine-ai-panel-widget')).not.toBeVisible();
  });

  test('should not show AI panel when space is pressed on non-paragraph block', async ({
    page,
    utils,
  }) => {
    await utils.editor.focusToEditor(page);
    await page.keyboard.insertText('```js');
    await page.keyboard.press('Enter');
    await expect(page.locator('affine-ai-panel-widget')).not.toBeVisible();
  });

  test('should hide AI panel and insert space back to editor when space is pressed on empty input', async ({
    page,
    utils,
  }) => {
    await utils.editor.focusToEditor(page);
    await page.keyboard.press('Space');
    await expect(page.locator('affine-ai-panel-widget')).toBeVisible();

    await page.keyboard.press('Space');
    await expect(page.locator('affine-ai-panel-widget')).not.toBeVisible();
    await expect(async () => {
      const content = await utils.editor.getEditorContent(page, false);
      expect(content).toBe(' ');
    }).toPass({ timeout: 5000 });
  });

  test('should support text with space in ai panel input', async ({
    page,
    utils,
  }) => {
    await utils.editor.focusToEditor(page);
    await page.keyboard.press('Space');
    await expect(page.locator('affine-ai-panel-widget')).toBeVisible();

    await page.keyboard.insertText('Hello');
    await page.keyboard.press('Space');
    await page.keyboard.insertText('World');
    await expect(async () => {
      const input = await page.locator('ai-panel-input textarea');
      expect(await input.inputValue()).toBe('Hello World');
    }).toPass({ timeout: 5000 });
  });
});
