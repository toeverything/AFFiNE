import { expect } from '@playwright/test';

import { test as baseTest } from './playwright';

type CurrentDocCollection = {
  meta: { id: string; flavour: string };
};

export const test = baseTest.extend<{
  workspace: {
    current: () => Promise<CurrentDocCollection>;
  };
}>({
  page: async ({ page }, use) => {
    await page.goto('/');
    await expect(
      page.locator('.affine-page-viewport[data-mode="page"]')
    ).toBeVisible({
      timeout: 30 * 1000,
    });
    await page.goto('/');
    await use(page);
    console.log(
      'Browser User Agent:',
      await page.evaluate(() => navigator.userAgent)
    );
  },
});
