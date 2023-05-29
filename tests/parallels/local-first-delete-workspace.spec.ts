import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
import {
  clickSideBarCurrentWorkspaceBanner,
  clickSideBarSettingButton,
} from '../libs/sidebar';
import { assertCurrentWorkspaceFlavour } from '../libs/workspace';

test('Create new workspace, then delete it', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
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
  await clickSideBarSettingButton(page);
  await page.getByTestId('delete-workspace-button').click();
  const workspaceNameDom = await page.getByTestId('workspace-name');
  const currentWorkspaceName = await workspaceNameDom.evaluate(
    node => node.textContent
  );
  await page
    .getByTestId('delete-workspace-input')
    .type(currentWorkspaceName as string);
  const promise = page
    .getByTestId('affine-toast')
    .waitFor({ state: 'attached' });
  await page.getByTestId('delete-workspace-confirm-button').click();
  await promise;
  await page.reload();
  await page.waitForSelector('[data-testid="workspace-name"]');
  await page.waitForTimeout(1000);
  expect(await page.getByTestId('workspace-name').textContent()).toBe(
    'Demo Workspace'
  );
  await assertCurrentWorkspaceFlavour('local', page);
});

test('Should not delete the last one workspace', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await clickSideBarSettingButton(page);
  await expect(
    page.getByTestId('warn-cannot-delete-last-workspace').isVisible()
  ).toBeTruthy();
  await assertCurrentWorkspaceFlavour('local', page);
});
