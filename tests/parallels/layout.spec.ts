import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
import { test } from '../libs/playwright';

test('Collapse Sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await page.getByTestId('sliderBar-arrowButton-collapse').click();
  const sliderBarArea = page.getByTestId('sliderBar-root');
  await expect(sliderBarArea).not.toBeInViewport();
});

test('Expand Sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await page.getByTestId('sliderBar-arrowButton-collapse').click();
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).not.toBeInViewport();

  await page.getByTestId('sliderBar-arrowButton-expand').click();
  await expect(sliderBarArea).toBeInViewport();
});

test('Click resizer can close sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).toBeVisible();

  await page.getByTestId('sliderBar-resizer').click();
  await expect(sliderBarArea).not.toBeInViewport();
});

test('Drag resizer can resize sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).toBeVisible();

  const sliderResizer = page.getByTestId('sliderBar-resizer');
  await sliderResizer.hover();
  await page.mouse.down();
  await page.mouse.move(400, 300, {
    steps: 10,
  });
  await page.mouse.up();
  const boundingBox = await page.getByTestId('sliderBar-root').boundingBox();
  expect(boundingBox?.width).toBe(400);
});

test('Sidebar in between sm & md breakpoint', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  const sliderBarModalBackground = page.getByTestId(
    'sliderBar-modalBackground'
  );
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
