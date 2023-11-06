import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  deleteUser,
  enableCloudWorkspace,
  getLoginCookie,
  loginUser,
  runPrisma,
} from '@affine-test/kit/utils/cloud';
import { clickEdgelessModeButton } from '@affine-test/kit/utils/editor';
import { coreUrl } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarSettingButton } from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
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
  test('migration', async ({ page, browser }) => {
    let workspaceId: string;
    {
      // create the old cloud workspace in another browser
      const context = await browser.newContext();
      const page = await context.newPage();
      await loginUser(page, user.email);
      await page.reload();
      await createLocalWorkspace(
        {
          name: 'test',
        },
        page
      );
      await enableCloudWorkspace(page);
      await clickNewPageButton(page);
      await waitForEditorLoad(page);
      // http://localhost:8080/workspace/2bc0b6c8-f68d-4dd3-98a8-be746754f9e1/xxx
      workspaceId = page.url().split('/')[4];
      await runPrisma(async client => {
        const sqls = (
          await readFile(
            resolve(__dirname, 'fixtures', '0.9.0-canary.9-snapshots.sql'),
            'utf-8'
          )
        )
          .replaceAll('2bc0b6c8-f68d-4dd3-98a8-be746754f9e1', workspaceId)
          .split('\n');
        await client.snapshot.deleteMany({
          where: {
            workspaceId,
          },
        });

        for (const sql of sqls) {
          await client.$executeRawUnsafe(sql);
        }
      });
      await page.close();
    }
    await page.reload();
    await page.waitForTimeout(1000);
    await page.goto(`${coreUrl}/workspace/${workspaceId}/all`);
    await page.getByTestId('upgrade-workspace-button').click();
    await expect(page.getByText('Refresh Current Page')).toBeVisible({
      timeout: 60000,
    });
    await page.goto(
      // page 'F1SX6cgNxy' has edgeless mode
      `${coreUrl}/workspace/${workspaceId}/F1SX6cgNxy`
    );
    await page.waitForTimeout(5000);
    await page.reload();
    await waitForEditorLoad(page);
    await clickEdgelessModeButton(page);
    await expect(page.locator('affine-edgeless-page')).toBeVisible({
      timeout: 1000,
    });
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
