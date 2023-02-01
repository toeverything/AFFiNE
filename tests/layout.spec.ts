import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page.js';

loadPage();

test.skip('Layout ui', () => {
  test('Collapse Sidebar', async ({ page }) => {
    await page.getByTestId('sliderBar-arrowButton').click();
    const sliderBarArea = page.getByTestId('sliderBar');
    await expect(sliderBarArea).not.toBeVisible();
  });

  test('Expand Sidebar', async ({ page }) => {
    await page.getByTestId('sliderBar-arrowButton').click();
    const sliderBarArea = page.getByTestId('sliderBar');
    await expect(sliderBarArea).not.toBeVisible();

    await page.getByTestId('sliderBar-arrowButton').click();
    await expect(sliderBarArea).toBeVisible();
  });
});
