import type { Page } from '@playwright/test';

export async function openHomePage(page: Page) {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('#__next');
}
