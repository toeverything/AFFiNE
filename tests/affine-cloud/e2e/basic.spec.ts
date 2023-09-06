import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  deleteUser,
  getLoginCookie,
  loginUser,
  runPrisma,
} from '@affine-test/kit/utils/cloud';
import { coreUrl } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { clickSideBarSettingButton } from '@affine-test/kit/utils/sidebar';
import { expect } from '@playwright/test';

let user: {
  id: string;
  name: string;
  email: string;
  password: string;
};

test.beforeEach(async () => {
  user = await createRandomUser();
});

test.beforeEach(async ({ page, context }) => {
  await loginUser(page, user.email, {
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
  test('migration', async ({ page }) => {
    const sqls = (
      await readFile(
        resolve(__dirname, 'fixtures', '0.9.0-canary.9-snapshots.sql'),
        'utf-8'
      )
    ).split('\n');
    await runPrisma(async client => {
      const snapshot = await client.snapshot.findFirst({
        where: {
          workspaceId: '2bc0b6c8-f68d-4dd3-98a8-be746754f9e1',
          id: '2bc0b6c8-f68d-4dd3-98a8-be746754f9e1',
        },
      });
      if (snapshot != null) {
        await client.snapshot.deleteMany({
          where: {
            workspaceId: '2bc0b6c8-f68d-4dd3-98a8-be746754f9e1',
          },
        });
      }
      for (const sql of sqls) {
        await client.$executeRawUnsafe(sql);
      }

      if (
        (await client.workspace.findUnique({
          where: {
            id: '2bc0b6c8-f68d-4dd3-98a8-be746754f9e1',
          },
        })) !== null
      ) {
        await client.workspace.delete({
          where: {
            id: '2bc0b6c8-f68d-4dd3-98a8-be746754f9e1',
          },
        });
      }

      // add workspace add give it to a user
      await client.workspace.create({
        data: {
          id: '2bc0b6c8-f68d-4dd3-98a8-be746754f9e1',
          public: false,
          users: {
            create: {
              type: 99,
              user: {
                connect: {
                  id: user.id,
                },
              },
              accepted: true,
            },
          },
        },
      });
    });
    await page.reload();
    await page.waitForTimeout(1000);
    await page.goto(
      `${coreUrl}/workspace/2bc0b6c8-f68d-4dd3-98a8-be746754f9e1/all`
    );
    await page.waitForTimeout(1000);
    const url = page.url();
    expect(
      url.endsWith(
        '/migration?workspace_id=2bc0b6c8-f68d-4dd3-98a8-be746754f9e1'
      ),
      {
        message: 'should be in migration page, but got ' + url,
      }
    ).toBeTruthy();
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
