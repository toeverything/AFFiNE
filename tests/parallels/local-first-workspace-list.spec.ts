import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
import { test } from '../libs/playwright';
import { clickSideBarAllPageButton } from '../libs/sidebar';
import { createWorkspace } from '../libs/workspace';

test.describe('Local first workspace list', () => {
  test('just one item in the workspace list at first', async ({ page }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
    const workspaceName = page.getByTestId('workspace-name');
    await workspaceName.click();
    expect(
      page
        .locator('div')
        .filter({ hasText: 'AFFiNE TestLocal WorkspaceAvailable Offline' })
        .nth(3)
    ).not.toBeNull();
  });

  test('create one workspace in the workspace list', async ({ page }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
    const newWorkspaceNameStr = 'New Workspace';
    await createWorkspace({ name: newWorkspaceNameStr }, page);

    // check new workspace name
    const newWorkspaceName = page.getByTestId('workspace-name');
    await newWorkspaceName.click();

    //check workspace list length
    const workspaceCards = await page.$$('data-testid=workspace-card');
    expect(workspaceCards.length).toBe(2);

    //check page list length
    const closeWorkspaceModal = page.getByTestId('close-workspace-modal');
    await closeWorkspaceModal.click();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(1000);
    const pageList = page.locator('[data-testid=page-list-item]');
    const result = await pageList.count();
    expect(result).toBe(0);
    await page.reload();
    await page.waitForTimeout(1000);
    const pageList1 = page.locator('[data-testid=page-list-item]');
    const result1 = await pageList1.count();
    expect(result1).toBe(0);
  });

  test('create multi workspace in the workspace list', async ({ page }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
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
