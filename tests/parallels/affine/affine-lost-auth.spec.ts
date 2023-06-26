import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../../libs/load-page';
import { waitEditorLoad } from '../../libs/page-logic';
import { clickSideBarAllPageButton } from '../../libs/sidebar';
import { createFakeUser, loginUser } from '../../libs/utils';
import { enableAffineCloudWorkspace } from '../../libs/workspace';

test.fixme('authorization expired', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const [a] = await createFakeUser();
  await loginUser(page, a);
  await enableAffineCloudWorkspace(page);
  await clickSideBarAllPageButton(page);
  await page.evaluate(() => localStorage.removeItem('affine-login-v2'));
  await openHomePage(page);
  await expect(page.getByTestId('new-workspace')).toBeVisible();
});
