import { test } from '@affine-test/kit/playwright';
import {
  addUserToWorkspace,
  createRandomUser,
  enableCloudWorkspace,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
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

test.beforeEach(async ({ page }) => {
  await loginUser(page, user.email);
});

test.describe('collaboration', () => {
  test('can enable share page', async ({ page, browser }) => {
    await page.reload();
    await waitForEditorLoad(page);
    await createLocalWorkspace(
      {
        name: 'test',
      },
      page
    );
    await enableCloudWorkspace(page);
    const title = getBlockSuiteEditorTitle(page);
    await title.type('TEST TITLE', {
      delay: 50,
    });
    await page.keyboard.press('Enter', { delay: 50 });
    await page.keyboard.type('TEST CONTENT', { delay: 50 });
    await page.getByTestId('share-menu-button').click();
    await page.getByTestId('share-menu-create-link-button').click();
    await page.getByTestId('share-menu-copy-link-button').click();

    // check share page is accessible
    {
      const context = await browser.newContext();
      const url: string = await page.evaluate(() =>
        navigator.clipboard.readText()
      );
      const page2 = await context.newPage();
      await page2.goto(url);
      await waitForEditorLoad(page2);
      const title = getBlockSuiteEditorTitle(page2);
      expect(await title.innerText()).toBe('TEST TITLE');
      expect(await page2.textContent('affine-paragraph')).toContain(
        'TEST CONTENT'
      );
    }
  });

  test('can collaborate with other user', async ({ page, browser }) => {
    await page.reload();
    await waitForEditorLoad(page);
    await createLocalWorkspace(
      {
        name: 'test',
      },
      page
    );
    await enableCloudWorkspace(page);
    await clickNewPageButton(page);
    const currentUrl = page.url();
    // format: http://localhost:8080/workspace/${workspaceId}/xxx
    const workspaceId = currentUrl.split('/')[4];
    const userB = await createRandomUser();
    const context = await browser.newContext();
    const page2 = await context.newPage();
    await loginUser(page2, userB.email);
    await addUserToWorkspace(workspaceId, userB.id, 1 /* READ */);
    await page2.reload();
    await waitForEditorLoad(page2);
    await page2.goto(currentUrl);
    {
      const title = getBlockSuiteEditorTitle(page);
      await title.type('TEST TITLE', {
        delay: 50,
      });
    }
    await page2.waitForTimeout(200);
    {
      const title = getBlockSuiteEditorTitle(page2);
      expect(await title.innerText()).toBe('TEST TITLE');
    }
  });
});
