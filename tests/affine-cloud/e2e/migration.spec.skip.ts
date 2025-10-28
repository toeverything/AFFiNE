import { readFile } from 'node:fs/promises';

import { Path, test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  deleteUser,
  enableCloudWorkspace,
  getLoginCookie,
  loginUser,
  runPrisma,
} from '@affine-test/kit/utils/cloud';
import { coreUrl } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
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

// TODO(@eyhn) mock migration from server data after page level upgrade implemented.
test.skip('migration', async ({ page, browser }) => {
  let workspaceId: string;
  {
    // create the old cloud workspace in another browser
    const context = await browser.newContext();
    const page = await context.newPage();
    await loginUser(page, user);
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
          Path.dir(import.meta.url).join(
            'fixtures',
            '0.9.0-canary.9-snapshots.sql'
          ).value,
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
});
