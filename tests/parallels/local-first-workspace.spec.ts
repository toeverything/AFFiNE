import { expect } from '@playwright/test';

import { loadPage } from './libs/load-page';
import { test } from './libs/playwright';
import { clickSideBarCurrentWorkspaceBanner } from './libs/sidebar';
import { assertCurrentWorkspaceFlavour } from './libs/workspace';

loadPage();

test.describe('Local first default workspace', () => {
  test('preset workspace name', async ({ page }) => {
    const workspaceName = page.getByTestId('workspace-name');
    expect(await workspaceName.textContent()).toBe('Demo Workspace');
    await assertCurrentWorkspaceFlavour('local', page);
  });

  // test('default workspace avatar', async ({ page }) => {
  //   const workspaceAvatar = page.getByTestId('workspace-avatar');
  //   expect(
  //     await workspaceAvatar.locator('img').getAttribute('src')
  //   ).not.toBeNull();
  // });
});
test.describe('Language switch', () => {
  test('Open language switch menu', async ({ page }) => {
    await clickSideBarCurrentWorkspaceBanner(page);
    const languageMenuButton = page.getByTestId('language-menu-button');
    await expect(languageMenuButton).toBeVisible();
    const actual = await languageMenuButton.innerText();
    expect(actual).toEqual('English');
    await assertCurrentWorkspaceFlavour('local', page);
  });
});
