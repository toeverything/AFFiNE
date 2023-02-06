import type { Page } from '@playwright/test';
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
  await page.getByRole('button', { name: 'Create' }).click();

  return page.waitForTimeout(300);
}
