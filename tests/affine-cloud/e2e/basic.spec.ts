import { test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  deleteUser,
  getLoginCookie,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
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

test('server exist', async () => {
  const json = await (await fetch('http://localhost:3010')).json();
  expect(json.compatibility).toMatch(/[0-9]+\.[0-9]+\.[0-9]+(-[a-z]+)?/);
});

test('enable cloud success', async ({ page, context }) => {
  await loginUser(page, user, {
    beforeLogin: async () => {
      expect(await getLoginCookie(context)).toBeUndefined();
    },
    afterLogin: async () => {
      expect(await getLoginCookie(context)).toBeTruthy();
      await page.reload();
      await waitEditorLoad(page);
      expect(await getLoginCookie(context)).toBeTruthy();
    },
  });
});
