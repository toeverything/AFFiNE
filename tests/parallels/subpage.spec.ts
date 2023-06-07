import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitEditorLoad } from '../libs/page-logic';

test('Create subpage', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await page.getByTestId('app-sidebar-arrow-button-collapse').click();
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).not.toBeInViewport();
});
