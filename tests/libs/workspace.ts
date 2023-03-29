import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

interface CreateWorkspaceParams {
  name: string;
}
export async function createWorkspace(
  params: CreateWorkspaceParams,
  page: Page
) {
  // open workspace list modal
  const workspaceName = page.getByTestId('workspace-name');
  await workspaceName.click();

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
  const actual = await page.evaluate(() => globalThis.currentWorkspace.flavour);
  expect(actual).toBe(flavour);
}
