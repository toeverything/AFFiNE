import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';

test('Create subpage', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await page.getByTestId('sliderBar-arrowButton-collapse').click();
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).not.toBeInViewport();
});
