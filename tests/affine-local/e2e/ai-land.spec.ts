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

  await expect(page.locator('chat-panel')).toBeVisible();
});
