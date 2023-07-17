import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('preset workspace name', async ({ page, workspace }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const workspaceName = page.getByTestId('workspace-name');
  await page.waitForTimeout(1000);
  expect(await workspaceName.textContent()).toBe('Demo Workspace');
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});

test('Open language switch menu', async ({ page, workspace }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const editorOptionMenuButton = page.getByTestId('editor-option-menu');
  await expect(editorOptionMenuButton).toBeVisible();
  await editorOptionMenuButton.click();
  const languageMenuButton = page.getByTestId('language-menu-button');
  await expect(languageMenuButton).toBeVisible();
  const actual = await languageMenuButton.innerText();
  expect(actual).toEqual('English');
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});
