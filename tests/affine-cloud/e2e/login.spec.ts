import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { clickSideBarCurrentWorkspaceBanner } from '@affine-test/kit/utils/sidebar';
import { expect } from '@playwright/test';

test.describe('login', () => {
  test('can open login modal in workspace list', async ({ page }) => {
    await openHomePage(page);
    await waitEditorLoad(page);
    await clickSideBarCurrentWorkspaceBanner(page);
    await page.getByTestId('cloud-signin-button').click({
      delay: 200,
    });
    await expect(page.getByTestId('auth-modal')).toBeVisible();
  });
});
