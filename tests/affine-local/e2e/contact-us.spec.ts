import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('Click right-bottom corner contact icon', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await page.locator('[data-testid=help-island]').click();
  const rightBottomContactUs = page.getByTestId('right-bottom-contact-us-icon');
  await expect(rightBottomContactUs).toBeVisible();

  await rightBottomContactUs.click();

  const title = page.getByTestId('about-title');
  await expect(title).toBeVisible();
});
