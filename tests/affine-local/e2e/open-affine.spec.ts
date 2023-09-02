import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { createWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

test('Open last workspace when back to affine', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await createWorkspace({ name: 'New Workspace 2' }, page);
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

test.skip('Download client tip', async ({ page }) => {
  await openHomePage(page);
  const downloadClientTipItem = page.locator(
    '[data-testid=download-client-tip]'
  );
  await expect(downloadClientTipItem).toBeVisible();
  const closeButton = page.locator(
    '[data-testid=download-client-tip-close-button]'
  );
  await closeButton.click();
  await expect(downloadClientTipItem).not.toBeVisible();
  await page.goto('http://localhost:8080');
  const currentDownloadClientTipItem = page.locator(
    '[data-testid=download-client-tip]'
  );
  await expect(currentDownloadClientTipItem).toBeVisible();
});

test('Check the class name for the scrollbar', async ({ page }) => {
  //Because the scroll bar in page mode depends on the class name of blocksuite
  await openHomePage(page);
  await waitForEditorLoad(page);
  const affineDocViewport = page.locator('.affine-doc-viewport');
  await expect(affineDocViewport).toBeVisible();
});
