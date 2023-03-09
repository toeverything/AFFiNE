import { expect } from '@playwright/test';

import { loadPage } from './libs/load-page';
import { test } from './libs/playwright';

loadPage();

test.describe('Layout ui', () => {
  test('Collapse Sidebar', async ({ page }) => {
    await page.getByTestId('sliderBar-arrowButton-collapse').click();
    const sliderBarArea = page.getByTestId('sliderBar');
    await expect(sliderBarArea).not.toBeVisible();
  });

  test('Expand Sidebar', async ({ page }) => {
    await page.getByTestId('sliderBar-arrowButton-collapse').click();
    const sliderBarArea = page.getByTestId('sliderBar');
    await expect(sliderBarArea).not.toBeVisible();

    await page.getByTestId('sliderBar-arrowButton-expand').click();
    await expect(sliderBarArea).toBeVisible();
  });
});
