import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { openWorkspaceSettingPanel } from '@affine-test/kit/utils/setting';
import { openSettingModal } from '@affine-test/kit/utils/setting';
import { clickSideBarCurrentWorkspaceBanner } from '@affine-test/kit/utils/sidebar';
import { expect } from '@playwright/test';

test('Create new workspace, then delete it', async ({ page, workspace }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await clickSideBarCurrentWorkspaceBanner(page);
  await page.getByTestId('new-workspace').click();
  await page
    .getByTestId('create-workspace-input')
    .type('Test Workspace', { delay: 50 });
  await page.getByTestId('create-workspace-create-button').click();

  await page.waitForTimeout(1000);
  await page.waitForSelector('[data-testid="workspace-name"]');
  expect(await page.getByTestId('workspace-name').textContent()).toBe(
    'Test Workspace'
  );
  await openSettingModal(page);
  await openWorkspaceSettingPanel(page, 'Test Workspace');
  await page.getByTestId('delete-workspace-button').click();
  const workspaceNameDom = await page.getByTestId('workspace-name');
  const currentWorkspaceName = await workspaceNameDom.evaluate(
    node => node.textContent
  );
  await page
    .getByTestId('delete-workspace-input')
    .type(currentWorkspaceName as string);
  const promise = page
    .getByTestId('affine-notification')
    .waitFor({ state: 'attached' });
  await page.getByTestId('delete-workspace-confirm-button').click();
  await promise;
  await page.reload();
  await page.waitForSelector('[data-testid="workspace-name"]');
  await page.waitForTimeout(1000);
  expect(await page.getByTestId('workspace-name').textContent()).toBe(
    'Demo Workspace'
  );
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});
//FIXME: this test is broken
test('Delete last workspace', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const workspaceNameDom = await page.getByTestId('workspace-name');
  const currentWorkspaceName = await workspaceNameDom.evaluate(
    node => node.textContent
  );
  await openSettingModal(page);
  await openWorkspaceSettingPanel(page, currentWorkspaceName as string);
  await page.getByTestId('delete-workspace-button').click();
  await page
    .getByTestId('delete-workspace-input')
    .type(currentWorkspaceName as string);
  await page.getByTestId('delete-workspace-confirm-button').click();
  await openHomePage(page);
  await expect(page.getByTestId('new-workspace')).toBeVisible();
  await page.getByTestId('new-workspace').click();
  await page.type('[data-testid="create-workspace-input"]', 'Test Workspace');
  await page.getByTestId('create-workspace-create-button').click();
  await page.waitForTimeout(1000);
  await page.waitForSelector('[data-testid="workspace-name"]');
  expect(await page.getByTestId('workspace-name').textContent()).toBe(
    'Test Workspace'
  );
});
