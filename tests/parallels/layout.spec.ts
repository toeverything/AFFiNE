import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitEditorLoad } from '../libs/page-logic';

test('Collapse Sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await page.getByTestId('app-sidebar-arrow-button-collapse').click();
  const sliderBarArea = page.getByTestId('app-sidebar');
  await expect(sliderBarArea).not.toBeInViewport();
});

test('Expand Sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await page.getByTestId('app-sidebar-arrow-button-collapse').click();
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).not.toBeInViewport();

  await page.getByTestId('app-sidebar-arrow-button-expand').click();
  await expect(sliderBarArea).toBeInViewport();
});

test('Click resizer can close sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).toBeVisible();

  await page.getByTestId('app-sidebar-resizer').click();
  await expect(sliderBarArea).not.toBeInViewport();
});

test('Drag resizer can resize sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).toBeVisible();

  const sliderResizer = page.getByTestId('app-sidebar-resizer');
  await sliderResizer.hover();
  await page.mouse.down();
  await page.mouse.move(400, 300, {
    steps: 10,
  });
  await page.mouse.up();
  const boundingBox = await page.getByTestId('app-sidebar').boundingBox();
  expect(boundingBox?.width).toBe(399);
});

test('Sidebar in between sm & md breakpoint', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  const sliderBarModalBackground = page.getByTestId('app-sidebar-float-mask');
  await expect(sliderBarArea).toBeInViewport();
  await expect(sliderBarModalBackground).not.toBeVisible();

  await page.setViewportSize({
    width: 768,
    height: 1024,
  });
  await expect(sliderBarModalBackground).toBeVisible();

  // click modal background can close sidebar
  await sliderBarModalBackground.click({
    force: true,
    position: { x: 600, y: 150 },
  });
  await expect(sliderBarArea).not.toBeInViewport();
});
