import { expect } from '@playwright/test';

import {
  dragBetweenCoords,
  enterPlaygroundRoom,
  initImageState,
} from '../utils/actions/index.js';
import { assertRichImage } from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test('select image should not show format bar', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initImageState(page);
  await assertRichImage(page, 1);

  const image = page.locator('affine-image');
  const rect = await image.boundingBox();
  if (!rect) {
    throw new Error('image not found');
  }
  await dragBetweenCoords(
    page,
    { x: rect.x - 20, y: rect.y + 20 },
    { x: rect.x + 20, y: rect.y + 40 }
  );
  const rects = page.locator('affine-block-selection').locator('visible=true');
  await expect(rects).toHaveCount(1);
  const formatQuickBar = page.locator(`.format-quick-bar`);
  await expect(formatQuickBar).not.toBeVisible();
  await page.mouse.wheel(0, rect.y + rect.height);
  await expect(formatQuickBar).not.toBeVisible();
  await page.mouse.click(0, 0);
});
