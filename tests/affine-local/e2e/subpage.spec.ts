import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('Create subpage', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await page
    .locator('[data-testid=app-sidebar-arrow-button-collapse][data-show=true]')
    .click();
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).not.toBeInViewport();
});
