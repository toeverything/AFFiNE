import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
import { test } from '../libs/playwright';

test.describe('Layout ui', () => {
  test('Collapse Sidebar', async ({ page }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
    await page.getByTestId('sliderBar-arrowButton-collapse').click();
    const sliderBarArea = page.getByTestId('sliderBar');
    await expect(sliderBarArea).not.toBeVisible();
  });

  test('Expand Sidebar', async ({ page }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
    await page.getByTestId('sliderBar-arrowButton-collapse').click();
    const sliderBarArea = page.getByTestId('sliderBar');
    await expect(sliderBarArea).not.toBeVisible();

    await page.getByTestId('sliderBar-arrowButton-expand').click();
    await expect(sliderBarArea).toBeVisible();
  });
});
