import { expect } from '@playwright/test';

import { loadPage } from './libs/load-page';
import { test } from './libs/playwright';
import { createWorkspace } from './libs/workspace';

loadPage();

test.describe('Open AFFiNE', () => {
  test('Open last workspace when back to affine', async ({ page }) => {
    await createWorkspace({ name: 'New Workspace 2' }, page);
    // FIXME: can not get when the new workspace is surely created, hack a timeout to wait
    // waiting for page loading end
    await page.waitForTimeout(3000);
    // show workspace list
    await page.getByTestId('workspace-name').click();

    //check workspace list length
    const workspaceCards = await page.$$('data-testid=workspace-card');
    expect(workspaceCards.length).toBe(2);
    await workspaceCards[1].click();
    await page.goto('http://localhost:8080');

    const workspaceNameDom = await page.getByTestId('workspace-name');
    const currentWorkspaceName = await workspaceNameDom.evaluate(
      node => node.textContent
    );
    expect(currentWorkspaceName).toEqual('New Workspace 2');
  });
});
