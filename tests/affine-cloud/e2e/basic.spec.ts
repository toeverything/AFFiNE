import { test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  deleteUser,
  getLoginCookie,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { clickSideBarSettingButton } from '@affine-test/kit/utils/sidebar';
import { expect } from '@playwright/test';

let user: {
  name: string;
  email: string;
  password: string;
};

test.beforeEach(async () => {
  user = await createRandomUser();
});

test.beforeEach(async ({ page, context }) => {
  await loginUser(page, user, {
    beforeLogin: async () => {
      expect(await getLoginCookie(context)).toBeUndefined();
    },
    afterLogin: async () => {
      expect(await getLoginCookie(context)).toBeTruthy();
      await page.reload();
      await waitForEditorLoad(page);
      expect(await getLoginCookie(context)).toBeTruthy();
    },
  });
});

test.afterEach(async () => {
  // if you want to keep the user in the database for debugging,
  // comment this line
  await deleteUser(user.email);
});

test.describe('basic', () => {
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
      await nameInput.type(newName, {
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
