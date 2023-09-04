import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function checkBlockHub(page: Page) {
  const box = await page.locator('affine-block-hub').boundingBox();
  if (!box) throw new Error('block-hub not found');
  await page.getByTestId('block-hub').click();
  await page.waitForTimeout(500);
  const box2 = await page.locator('affine-block-hub').boundingBox();
  if (!box2) throw new Error('block-hub not found');
  expect(box2.height).toBeGreaterThan(box.height);
}

export async function clickEdgelessModeButton(page: Page) {
  await page.getByTestId('switch-edgeless-mode-button').click({
    delay: 50,
  });
}

export async function clickPageModeButton(page: Page) {
  return page.getByTestId('switch-page-mode-button').click({
    delay: 50,
  });
}
