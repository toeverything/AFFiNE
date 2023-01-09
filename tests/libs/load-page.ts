import { test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface IType {
  page: Page;
}
export function loadPage() {
  test.beforeEach(async ({ page }: IType) => {
    await page.goto('http://localhost:8080');
    // waiting for page loading end
    await page.waitForSelector('#__next');
  });
}
