import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

test('Open last workspace when back to affine', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await createLocalWorkspace({ name: 'New Workspace 2' }, page);
  await waitForEditorLoad(page);
  // show workspace list
  await page.getByTestId('workspace-name').click();

  //check workspace list length
  const workspaceCards = await page.$$('data-testid=workspace-card');
  expect(workspaceCards.length).toBe(2);
  await workspaceCards[1].click();
  await openHomePage(page);

  const workspaceNameDom = page.getByTestId('workspace-name');
  const currentWorkspaceName = await workspaceNameDom.evaluate(
    node => node.textContent
  );
  expect(currentWorkspaceName).toEqual('New Workspace 2');
});

test('Download client tip', async ({ page }) => {
  await openHomePage(page);
  const localDemoTipsItem = page.locator('[data-testid=local-demo-tips]');
  await expect(localDemoTipsItem).toBeVisible();
  const closeButton = page.locator(
    '[data-testid=local-demo-tips-close-button]'
  );
  await closeButton.click();
  await expect(localDemoTipsItem).not.toBeVisible();
  await page.reload();
  const currentLocalDemoTipsItemItem = page.locator(
    '[data-testid=local-demo-tips]'
  );
  await expect(currentLocalDemoTipsItemItem).toBeVisible();
});
