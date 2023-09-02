import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import {
  createWorkspace,
  openWorkspaceListModal,
} from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

test('just one item in the workspace list at first', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  const workspaceName = page.getByTestId('workspace-name');
  await workspaceName.click();
  expect(
    page
      .locator('div')
      .filter({ hasText: 'AFFiNE TestLocal WorkspaceAvailable Offline' })
      .nth(3)
  ).not.toBeNull();
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});

test('create one workspace in the workspace list', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  const newWorkspaceNameStr = 'New Workspace';
  await createWorkspace({ name: newWorkspaceNameStr }, page);

  // check new workspace name
  const newWorkspaceName = page.getByTestId('workspace-name');
  await newWorkspaceName.click();

  //check workspace list length
  const workspaceCards = await page.$$('data-testid=workspace-card');
  expect(workspaceCards.length).toBe(2);

  //check page list length
  await page.keyboard.press('Escape');
  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(1000);
  const pageList = page.locator('[data-testid=page-list-item]');
  const result = await pageList.count();
  expect(result).toBe(0);
  await page.reload();
  await page.waitForTimeout(1000);
  const pageList1 = page.locator('[data-testid=page-list-item]');
  const result1 = await pageList1.count();
  expect(result1).toBe(0);
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});

test('create multi workspace in the workspace list', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await createWorkspace({ name: 'New Workspace 2' }, page);
  await createWorkspace({ name: 'New Workspace 3' }, page);

  // show workspace list
  const workspaceName = page.getByTestId('workspace-name');
  await workspaceName.click();

  await page.waitForTimeout(1000);

  {
    //check workspace list length
    const workspaceCards = await page.$$('data-testid=workspace-card');
    expect(workspaceCards.length).toBe(3);
  }

  await page.reload();
  await openWorkspaceListModal(page);
  await page.getByTestId('draggable-item').nth(1).click();
  await page.waitForTimeout(500);

  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');

  await openWorkspaceListModal(page);
  await page.waitForTimeout(1000);
  const sourceElement = page.getByTestId('draggable-item').nth(2);
  const targetElement = page.getByTestId('draggable-item').nth(1);

  const sourceBox = await sourceElement.boundingBox();
  const targetBox = await targetElement.boundingBox();

  if (!sourceBox || !targetBox) {
    throw new Error('sourceBox or targetBox is null');
  }

  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
    {
      steps: 5,
    }
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    {
      steps: 5,
    }
  );
  await page.mouse.up();
  await page.waitForTimeout(1000);
  await page.reload();
  await openWorkspaceListModal(page);

  await page.waitForTimeout(1000);
  // check workspace list length
  {
    await page.waitForTimeout(1000);
    const workspaceCards = page.getByTestId('workspace-card');
    expect(await workspaceCards.count()).toBe(3);
  }

  const workspaceChangePromise = page.evaluate(() => {
    new Promise(resolve => {
      window.addEventListener('affine:workspace:change', resolve, {
        once: true,
      });
    });
  });
  await page.getByTestId('draggable-item').nth(2).click();
  await workspaceChangePromise;

  const nextWorkspace = await workspace.current();

  expect(currentWorkspace.id).toBe(nextWorkspace.id);
});
