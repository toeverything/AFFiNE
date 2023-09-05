import type { Page } from '@playwright/test';

interface CreateWorkspaceParams {
  name: string;
}

export async function openWorkspaceListModal(page: Page) {
  await page.getByTestId('workspace-name').click({
    delay: 50,
  });
}

export async function createLocalWorkspace(
  params: CreateWorkspaceParams,
  page: Page
) {
  await openWorkspaceListModal(page);

  // open create workspace modal
  await page.getByTestId('new-workspace').click();

  // input workspace name
  await page.getByPlaceholder('Set a Workspace name').click();
  await page.getByPlaceholder('Set a Workspace name').fill(params.name);

  // click create button
  return page.getByRole('button', { name: 'Create' }).click({
    delay: 500,
  });
}
