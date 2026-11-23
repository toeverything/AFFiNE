import { test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  enableCloudWorkspace,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { clickPageModeButton } from '@affine-test/kit/utils/editor';
import {
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
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

test('should transform local favorites data', async ({ page }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await page
    .getByTestId('navigation-panel-bar-add-favorite-button')
    .first()
    .click();
  await clickPageModeButton(page);
  await waitForEmptyEditor(page);

  await getBlockSuiteEditorTitle(page).fill('this is a new fav page');
  await expect(
    page
      .getByTestId('navigation-panel-favorites')
      .locator('[draggable] >> text=this is a new fav page')
  ).toBeVisible();

  await enableCloudWorkspace(page);
  await expect(
    page
      .getByTestId('navigation-panel-favorites')
      .locator('[draggable] >> text=this is a new fav page')
  ).toBeVisible();
});
