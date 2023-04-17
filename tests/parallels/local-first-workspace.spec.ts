import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
import { test } from '../libs/playwright';
import { clickSideBarCurrentWorkspaceBanner } from '../libs/sidebar';
import { assertCurrentWorkspaceFlavour } from '../libs/workspace';

test('preset workspace name', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  const workspaceName = page.getByTestId('workspace-name');
  await page.waitForTimeout(1000);
  expect(await workspaceName.textContent()).toBe('Demo Workspace');
  await assertCurrentWorkspaceFlavour('local', page);
});

// test('default workspace avatar', async ({ page }) => {
//   const workspaceAvatar = page.getByTestId('workspace-avatar');
//   expect(
//     await workspaceAvatar.locator('img').getAttribute('src')
//   ).not.toBeNull();
// });
test('Open language switch menu', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await clickSideBarCurrentWorkspaceBanner(page);
  const languageMenuButton = page.getByTestId('language-menu-button');
  await expect(languageMenuButton).toBeVisible();
  const actual = await languageMenuButton.innerText();
  expect(actual).toEqual('English');
  await assertCurrentWorkspaceFlavour('local', page);
});
