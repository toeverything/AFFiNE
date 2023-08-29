import { test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  deleteUser,
  getLoginCookie,
} from '@affine-test/kit/utils/cloud';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { clickSideBarCurrentWorkspaceBanner } from '@affine-test/kit/utils/sidebar';
import { expect } from '@playwright/test';

let user: {
  name: string;
  email: string;
  password: string;
};

test.beforeEach(async () => {
  user = await createRandomUser();
});

test.afterEach(async () => {
  // if you want to keep the user in the database for debugging,
  // comment this line
  await deleteUser(user.email);
});

test('server exist', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);

  const json = await (await fetch('http://localhost:3010')).json();
  expect(json.message).toMatch(/^AFFiNE GraphQL server/);
});

test('enable cloud success', async ({ page, context }) => {
  await page.goto('http://localhost:8080');
  await page.waitForSelector('v-line');

  await clickSideBarCurrentWorkspaceBanner(page);
  await page.getByTestId('cloud-signin-button').click({
    delay: 200,
  });
  await page.getByPlaceholder('Enter your email address').type(user.email, {
    delay: 50,
  });
  await page.getByTestId('continue-login-button').click({
    delay: 200,
  });
  await page.getByTestId('sign-in-with-password').click({
    delay: 200,
  });
  await page.getByTestId('password-input').type('123456', {
    delay: 50,
  });
  expect(await getLoginCookie(context)).toBeUndefined();
  await page.getByTestId('sign-in-button').click();
  await page.waitForTimeout(1000);
  await page.reload();
  await waitEditorLoad(page);
  expect(await getLoginCookie(context)).toBeTruthy();
});
