import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { waitForEditorLoad } from './page-logic';

interface CreateWorkspaceParams {
  name: string;
}

export async function openWorkspaceListModal(page: Page) {
  await page.getByTestId('app-sidebar').getByTestId('workspace-name').click({
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

  // const isDesktop: boolean = await page.evaluate(() => {
  //   return !!window.appInfo?.electron;
  // }, []);

  // input workspace name
  await page.getByPlaceholder('Set a Workspace name').click();
  await page.getByPlaceholder('Set a Workspace name').fill(params.name);

  // click create button
  await page.getByTestId('create-workspace-create-button').click({
    delay: 500,
  });

  await expect(
    page.getByTestId('create-workspace-create-button')
  ).not.toBeAttached();
  await waitForEditorLoad(page);

  await expect(page.getByTestId('workspace-name')).toHaveText(params.name);

  // if (isDesktop) {
  //   await page.getByTestId('create-workspace-continue-button').click();
  // }
}
