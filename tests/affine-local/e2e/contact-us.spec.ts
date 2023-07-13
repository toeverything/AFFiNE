import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('Click right-bottom corner contact icon', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await page.locator('[data-testid=help-island]').click();
  const rightBottomContactUs = page.locator(
    '[data-testid=right-bottom-contact-us-icon]'
  );
  expect(await rightBottomContactUs.isVisible()).toEqual(true);

  await rightBottomContactUs.click();

  const title = await page.getByTestId('about-title');
  await expect(title).toBeVisible();
});
