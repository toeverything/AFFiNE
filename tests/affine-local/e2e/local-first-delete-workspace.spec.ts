import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import {
  openSettingModal,
  openWorkspaceSettingPanel,
} from '@affine-test/kit/utils/setting';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

test('Create new workspace, then delete it', async ({ page, workspace }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await createLocalWorkspace({ name: 'Test Workspace' }, page);

  await page.waitForSelector('[data-testid="workspace-name"]');
  expect(await page.getByTestId('workspace-name').textContent()).toBe(
    'Test Workspace'
  );
  await openSettingModal(page);
  await openWorkspaceSettingPanel(page);
  await page.getByTestId('delete-workspace-button').click();
  await expect(
    page.locator('.affine-notification-center').first()
  ).not.toBeVisible();
  const workspaceNameDom = page.getByTestId('workspace-name');
  const currentWorkspaceName = (await workspaceNameDom.evaluate(
    node => node.textContent
  )) as string;
  expect(currentWorkspaceName).toBeDefined();
  await page
    .getByTestId('delete-workspace-input')
    .pressSequentially(currentWorkspaceName);
  const promise = page
    .locator('.affine-notification-center')
    .first()
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

  expect(currentWorkspace.meta.flavour).toContain('local');
});

test('Delete last workspace', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  const workspaceNameDom = page.getByTestId('workspace-name');
  const currentWorkspaceName = await workspaceNameDom.evaluate(
    node => node.textContent
  );
  await openSettingModal(page);
  await openWorkspaceSettingPanel(page);
  await page.getByTestId('delete-workspace-button').click();
  await page
    .getByTestId('delete-workspace-input')
    .pressSequentially(currentWorkspaceName as string);
  await page.getByTestId('delete-workspace-confirm-button').click();
  await openHomePage(page);
  await expect(page.getByTestId('new-workspace')).toBeVisible();
  await createLocalWorkspace({ name: 'Test Workspace' }, page, true);
  await page.waitForTimeout(1000);
  await page.waitForSelector('[data-testid="workspace-name"]');
  await expect(page.getByTestId('workspace-name')).toHaveText('Test Workspace');
});
