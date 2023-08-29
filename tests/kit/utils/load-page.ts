import type { Page } from '@playwright/test';

export const coreUrl = 'http://localhost:8080';
export const prototypeUrl = 'http://localhost:3003';

export async function openHomePage(page: Page) {
  await page.goto(coreUrl);
}

export async function openPluginPage(page: Page) {
  await page.goto(`${coreUrl}/_plugin/index.html`);
}

export async function openPrototypeProviderStatusPage(page: Page) {
  await page.goto(`${prototypeUrl}/suite/provider-status.html`);
}
