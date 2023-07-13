import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('Create subpage', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await page.getByTestId('app-sidebar-arrow-button-collapse').click();
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).not.toBeInViewport();
});
