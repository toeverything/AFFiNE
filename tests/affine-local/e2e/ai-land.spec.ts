import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('Click ai-land icon', async ({ page }) => {
  test.skip(process.env.CI !== undefined, 'Skip test in CI');
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await page.locator('[data-testid=ai-island]').click();

  await expect(page.getByTestId('chat-panel-input-container')).toBeVisible();
});

test('AI island is hidden when AI is disabled', async ({ page }) => {
  test.skip(process.env.CI !== undefined, 'Skip test in CI');
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);

  // Verify AI island is visible before disabling
  await expect(page.getByTestId('ai-island')).toBeVisible();

  // Disable AI via the feature flag in localStorage
  await page.evaluate(() => {
    localStorage.setItem(
      'global-state:affine-flag:enable_ai',
      JSON.stringify(false)
    );
  });

  // Reload to pick up the flag change
  await page.reload();
  await waitForEditorLoad(page);

  // AI island should not be visible
  await expect(page.getByTestId('ai-island')).toBeHidden();
});
