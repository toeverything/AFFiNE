import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
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
  const editorOptionMenuButton = page.getByTestId('editor-option-menu');
  await expect(editorOptionMenuButton).toBeVisible();
  await editorOptionMenuButton.click();
  const languageMenuButton = page.getByTestId('language-menu-button');
  await expect(languageMenuButton).toBeVisible();
  const actual = await languageMenuButton.innerText();
  expect(actual).toEqual('English');
  await assertCurrentWorkspaceFlavour('local', page);
});
