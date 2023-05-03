import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
import { clickSideBarSettingButton } from '../libs/sidebar';
import { assertCurrentWorkspaceFlavour } from '../libs/workspace';

test('New a workspace , then delete it in all workspaces, permanently delete it', async ({
  page,
}) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
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
  expect(await page.getByTestId('workspace-name').textContent()).toBe(
    'Demo Workspace'
  );
  await assertCurrentWorkspaceFlavour('local', page);
});
