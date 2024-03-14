import { test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  enableCloudWorkspace,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { clickUserInfoCard } from '@affine-test/kit/utils/setting';
import {
  clickSideBarAllPageButton,
  clickSideBarCurrentWorkspaceBanner,
  clickSideBarSettingButton,
} from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

test('can open login modal in workspace list', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickSideBarCurrentWorkspaceBanner(page);
  await page.getByTestId('cloud-signin-button').click({
    delay: 200,
  });
  await expect(page.getByTestId('auth-modal')).toBeVisible();
});

test.describe('login first', () => {
  let user: {
    id: string;
    name: string;
    email: string;
    password: string;
  };

  test.beforeEach(async ({ page }) => {
    user = await createRandomUser();
    await loginUser(page, user.email);
  });

  test('exit successfully and re-login', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    const url = page.url();
    await createLocalWorkspace(
      {
        name: 'test',
      },
      page
    );
    await enableCloudWorkspace(page);
    await clickSideBarSettingButton(page);
    await clickUserInfoCard(page);
    await page.getByTestId('sign-out-button').click();
    await page.getByTestId('confirm-sign-out-button').click();
    await page.waitForTimeout(5000);
    expect(page.url()).toBe(url);
  });

  test('can sign out', async ({ page }) => {
    await page.reload();
    await waitForEditorLoad(page);
    await createLocalWorkspace(
      {
        name: 'test',
      },
      page
    );
    await clickSideBarAllPageButton(page);
    const currentUrl = page.url();
    await clickSideBarCurrentWorkspaceBanner(page);
    await page.getByTestId('workspace-modal-account-option').click();
    await page.getByTestId('workspace-modal-sign-out-option').click();
    await page.getByTestId('confirm-sign-out-button').click();
    await page.reload();
    await clickSideBarCurrentWorkspaceBanner(page);
    const signInButton = page.getByTestId('cloud-signin-button');
    await expect(signInButton).toBeVisible();
    expect(page.url()).toBe(currentUrl);
  });

  test('can see and change email and password in setting panel', async ({
    page,
  }) => {
    const newName = 'test name';
    {
      await clickSideBarSettingButton(page);
      const locator = page.getByTestId('user-info-card');
      expect(locator.getByText(user.email)).toBeTruthy();
      expect(locator.getByText(user.name)).toBeTruthy();
      await locator.click({
        delay: 50,
      });
      const nameInput = page.getByPlaceholder('Input account name');
      await nameInput.clear();
      await nameInput.pressSequentially(newName, {
        delay: 50,
      });
      await page.getByTestId('save-user-name').click({
        delay: 50,
      });
    }
    await page.reload();
    {
      await clickSideBarSettingButton(page);
      const locator = page.getByTestId('user-info-card');
      expect(locator.getByText(user.email)).toBeTruthy();
      expect(locator.getByText(newName)).toBeTruthy();
    }
  });
});
