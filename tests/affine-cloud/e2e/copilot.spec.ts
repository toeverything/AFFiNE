import { test } from '@affine-test/kit/playwright';
import { createRandomAIUser, loginUser } from '@affine-test/kit/utils/cloud';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import {
  clickSideBarAllPageButton,
  clickSideBarCurrentWorkspaceBanner,
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
    user = await createRandomAIUser();
    await loginUser(page, user.email);
  });

  test('start chat', async ({ page }) => {
    await page.reload();
    await clickSideBarAllPageButton(page);
    await page.waitForTimeout(200);
    await createLocalWorkspace({ name: 'test' }, page);
  });
});
