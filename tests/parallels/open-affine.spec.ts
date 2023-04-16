import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
import { test } from '../libs/playwright';
import { createWorkspace } from '../libs/workspace';

test('Open last workspace when back to affine', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await createWorkspace({ name: 'New Workspace 2' }, page);
  // FIXME: can not get when the new workspace is surely created, hack a timeout to wait
  // waiting for page loading end
  await page.waitForTimeout(3000);
  // show workspace list
  await page.getByTestId('workspace-name').click();

  //check workspace list length
  const workspaceCards = await page.$$('data-testid=workspace-card');
  expect(workspaceCards.length).toBe(2);
  await workspaceCards[1].click();
  await openHomePage(page);

  const workspaceNameDom = await page.getByTestId('workspace-name');
  const currentWorkspaceName = await workspaceNameDom.evaluate(
    node => node.textContent
  );
  expect(currentWorkspaceName).toEqual('New Workspace 2');
});

test('Open affine in first time after updated', async ({ page }) => {
  await openHomePage(page);
  const changeLogItem = page.locator('[data-testid=change-log]');
  await expect(changeLogItem).toBeVisible();
  const closeButton = page.locator('[data-testid=change-log-close-button]');
  await closeButton.click();
  await expect(changeLogItem).not.toBeVisible();
  await page.goto('http://localhost:8080');
  const currentChangeLogItem = page.locator('[data-testid=change-log]');
  await expect(currentChangeLogItem).not.toBeVisible();
});
test('Click right-bottom corner change log icon', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await page.locator('[data-testid=help-island]').click();
  const editorRightBottomChangeLog = page.locator(
    '[data-testid=right-bottom-change-log-icon]'
  );
  await page.waitForTimeout(50);
  expect(await editorRightBottomChangeLog.isVisible()).toEqual(true);
  await page.getByRole('link', { name: 'All pages' }).click();
  const normalRightBottomChangeLog = page.locator(
    '[data-testid=right-bottom-change-log-icon]'
  );
  expect(await normalRightBottomChangeLog.isVisible()).toEqual(true);
});
