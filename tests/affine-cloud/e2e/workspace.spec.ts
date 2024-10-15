import { test } from '@affine-test/kit/playwright';
import {
  addUserToWorkspace,
  createRandomUser,
  enableCloudWorkspace,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { clickPageModeButton } from '@affine-test/kit/utils/editor';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import {
  openSettingModal,
  openWorkspaceSettingPanel,
} from '@affine-test/kit/utils/setting';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

let user: {
  id: string;
  name: string;
  email: string;
  password: string;
};

test.beforeEach(async ({ page }) => {
  user = await createRandomUser();
  await loginUser(page, user);
});

test('should have pagination in member list', async ({ page }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspace(page);
  await clickNewPageButton(page);
  const currentUrl = page.url();
  // format: http://localhost:8080/workspace/${workspaceId}/xxx
  const workspaceId = currentUrl.split('/')[4];

  // create 10 user and add to workspace
  const createUserAndAddToWorkspace = async () => {
    const userB = await createRandomUser();
    await addUserToWorkspace(workspaceId, userB.id, 1 /* READ */);
  };
  await Promise.all(
    Array.from({ length: 10 })
      .fill(1)
      .map(() => createUserAndAddToWorkspace())
  );

  await openSettingModal(page);
  await openWorkspaceSettingPanel(page, 'test');

  await page.waitForTimeout(1000);

  const firstPageMemberItemCount = await page
    .locator('[data-testid="member-item"]')
    .count();

  expect(firstPageMemberItemCount).toBe(8);

  const navigationItems = await page
    .getByRole('navigation')
    .getByRole('button')
    .all();

  // make sure the first member is the owner
  await expect(page.getByTestId('member-item').first()).toContainText(
    'Workspace Owner'
  );

  // There have four pagination items: < 1 2 >
  expect(navigationItems.length).toBe(4);
  // Click second page
  await navigationItems[2].click();
  await page.waitForTimeout(500);
  // There should have other three members in second page
  const secondPageMemberItemCount = await page
    .locator('[data-testid="member-item"]')
    .count();
  expect(secondPageMemberItemCount).toBe(3);
  // Click left arrow to back to first page
  await navigationItems[0].click();
  await page.waitForTimeout(500);
  expect(await page.locator('[data-testid="member-item"]').count()).toBe(8);
  // Click right arrow to second page
  await navigationItems[3].click();
  await page.waitForTimeout(500);
  expect(await page.locator('[data-testid="member-item"]').count()).toBe(3);
});

test('should transform local favorites data', async ({ page }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await page.getByTestId('explorer-bar-add-favorite-button').first().click();
  await clickPageModeButton(page);
  await waitForEmptyEditor(page);

  await getBlockSuiteEditorTitle(page).fill('this is a new fav page');
  await expect(
    page
      .getByTestId('explorer-favorites')
      .locator('[draggable] >> text=this is a new fav page')
  ).toBeVisible();

  await enableCloudWorkspace(page);
  await expect(
    page
      .getByTestId('explorer-favorites')
      .locator('[draggable] >> text=this is a new fav page')
  ).toBeVisible();
});
