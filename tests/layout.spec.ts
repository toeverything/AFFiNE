import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe('Layout ui', () => {
  test('Collapse Sidebar', async ({ page }) => {
    await page.getByTestId('sliderBar-arrowButton').click();

    const sliderBarArea = await page.getByText(
      'Quick search All pagesFavouritesNo item Import Trash New Page'
    );

    await expect(sliderBarArea).not.toBeVisible();
  });

  test('Expand Sidebar', async ({ page }) => {
    await page.getByTestId('sliderBar-arrowButton').click();

    const sliderBarArea = await page.getByText(
      'Quick search All pagesFavouritesNo item Import Trash New Page'
    );

    await expect(sliderBarArea).not.toBeVisible();

    await page.getByTestId('sliderBar-arrowButton').click();

    await expect(sliderBarArea).toBeVisible();
  });
});
