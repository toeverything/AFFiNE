import type { Page } from '@playwright/test';

import { getMetas } from './utils';

export const webUrl = 'http://localhost:8080';

export async function openHomePage(page: Page) {
  await page.goto(webUrl);
}

export async function initHomePageWithPinboard(page: Page) {
  await openHomePage(page);
  await page.waitForSelector('[data-testid="sidebar-pinboard-container"]');
  return (await getMetas(page)).find(m => m.isRootPinboard);
}
