import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { clickCollaborationPanel } from './setting';
import { clickSideBarSettingButton } from './sidebar';

interface CreateWorkspaceParams {
  name: string;
}

export async function openWorkspaceListModal(page: Page) {
  const workspaceName = page.getByTestId('workspace-name');
  await workspaceName.click();
}

export async function createWorkspace(
  params: CreateWorkspaceParams,
  page: Page
) {
  await openWorkspaceListModal(page);

  // open create workspace modal
  await page.locator('.add-icon').click();

  // input workspace name
  await page.getByPlaceholder('Set a Workspace name').click();
  await page.getByPlaceholder('Set a Workspace name').fill(params.name);

  // click create button
  return page.getByRole('button', { name: 'Create' }).click();
}

export async function assertCurrentWorkspaceFlavour(
  flavour: 'affine' | 'local',
  page: Page
) {
  // @ts-expect-error
  const actual = await page.evaluate(() => globalThis.currentWorkspace.flavour);
  expect(actual).toBe(flavour);
}

export async function enableAffineCloudWorkspace(page: Page) {
  await clickSideBarSettingButton(page);
  await page.waitForTimeout(50);
  await clickCollaborationPanel(page);
  await page.getByTestId('local-workspace-enable-cloud-button').click();
  await page.getByTestId('confirm-enable-cloud-button').click();
  await page.waitForSelector("[data-testid='member-length']", {
    timeout: 20000,
  });
}
