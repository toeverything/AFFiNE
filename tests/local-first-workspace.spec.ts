import { expect } from '@playwright/test';
import { test } from './libs/playwright.js';
import { loadPage } from './libs/load-page.js';

loadPage();

test.describe('Local first default workspace', () => {
  test('preset workspace name', async ({ page }) => {
    const workspaceName = page.getByTestId('workspace-name');
    expect(await workspaceName.textContent()).toBe('AFFiNE Test');
  });

  test('default workspace avatar', async ({ page }) => {
    const workspaceAvatar = page.getByTestId('workspace-avatar');
    expect(
      await workspaceAvatar.locator('img').getAttribute('src')
    ).not.toBeNull();
  });
});
test.describe('Language switch', () => {
  test('Open language switch menu', async ({ page }) => {
    await page.getByTestId('current-workspace').click();
    const languageMenuButton = page.getByTestId('language-menu-button');
    await expect(languageMenuButton).toBeVisible();
    const actual = await languageMenuButton.innerText();
    expect(actual).toEqual('English');
  });
});
