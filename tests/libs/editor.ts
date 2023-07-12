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
