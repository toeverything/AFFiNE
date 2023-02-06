import { expect } from '@playwright/test';
import { test } from './libs/playwright.js';
import { loadPage } from './libs/load-page.js';
import { createWorkspace } from './libs/workspace-logic.js';
loadPage();

test.describe('Local first workspace list', () => {
  test('just one item in the workspace list at first', async ({ page }) => {
    const workspaceName = page.getByTestId('workspace-name');
    await workspaceName.click();
    expect(
      page
        .locator('div')
        .filter({ hasText: 'AFFiNE TestLocal WorkspaceAvailable Offline' })
        .nth(3)
    ).not.toBeNull();
  });

  test.skip('create one workspace in the workspace list', async ({ page }) => {
    const newWorkspaceNameStr = 'New Workspace';
    await createWorkspace({ name: newWorkspaceNameStr }, page);

    // check new workspace name
    const newWorkspaceName = page.getByTestId('workspace-name');
    expect(await newWorkspaceName.textContent()).toBe(newWorkspaceNameStr);
  });

  test('create multi workspace in the workspace list', async ({ page }) => {
    await createWorkspace({ name: 'New Workspace 2' }, page);
    await createWorkspace({ name: 'New Workspace 3' }, page);

    // show workspace list
    const workspaceName = page.getByTestId('workspace-name');
    await workspaceName.click();

    //check workspace list length
    const workspaceCards = await page.$$('data-testid=workspace-card');
    expect(workspaceCards.length).toBe(3);
  });
});
