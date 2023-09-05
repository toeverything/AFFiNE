import { test } from '@affine-test/kit/electron';
import {
  createRandomUser,
  enableCloudWorkspace,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';

let user: {
  name: string;
  email: string;
  password: string;
};
test.beforeEach(async () => {
  user = await createRandomUser();
});

test.beforeEach(async ({ page }) => {
  await loginUser(page, user.email);
});

test('new page', async ({ page }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspace(page);
});
