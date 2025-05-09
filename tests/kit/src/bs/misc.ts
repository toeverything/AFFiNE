import type { Page } from '@playwright/test';

export async function waitNextFrame(page: Page) {
  await page.evaluate(
    () => new Promise(resolve => requestAnimationFrame(resolve))
  );
}
