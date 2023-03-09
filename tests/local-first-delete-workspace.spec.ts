import { expect } from '@playwright/test';

import { loadPage } from './libs/load-page';
import { test } from './libs/playwright';
import { clickSideBarSettingButton } from './libs/sidebar';

loadPage();

test.describe('Local first delete workspace', () => {
  test('New a workspace , then delete it in all workspaces, permanently delete it', async ({
    page,
  }) => {
    await clickSideBarSettingButton(page);
    await page.getByTestId('delete-workspace-button').click();
    const workspaceNameDom = await page.getByTestId('workspace-name');
    const currentWorkspaceName = await workspaceNameDom.evaluate(
      node => node.textContent
    );
    await page
      .getByTestId('delete-workspace-input')
      .type(currentWorkspaceName as string);
    await page.getByTestId('delete-workspace-confirm-button').click();
    expect(await page.getByTestId('workspace-card').count()).toBe(0);
    await page.mouse.click(1, 1);
    expect(await page.getByTestId('workspace-card').count()).toBe(0);
  });
});
