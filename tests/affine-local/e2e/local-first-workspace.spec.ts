import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('preset workspace name', async ({ page, workspace }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  const workspaceName = page.getByTestId('workspace-name');
  await page.waitForTimeout(1000);
  expect(await workspaceName.textContent()).toBe('Demo Workspace');
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});
