import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe('Login Flow', () => {
  test('Open Login Modal', async ({ page }) => {
    await page.getByTestId('current-workspace').click();
    await page.waitForTimeout(800);
    // why don't we use waitForSelector, It seems that waitForSelector not stable?
    await page.getByTestId('open-login-modal').click();
    await page.waitForTimeout(800);
    await page
      .getByRole('heading', { name: 'Currently not logged in' })
      .click();
  });
});
