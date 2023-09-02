import { test } from '@affine-test/kit/playwright';
import { createRandomUser, loginUser } from '@affine-test/kit/utils/cloud';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarSettingButton } from '@affine-test/kit/utils/sidebar';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

let user: {
  name: string;
  email: string;
  password: string;
};

test.beforeEach(async () => {
  user = await createRandomUser();
});

test.beforeEach(async ({ page }) => {
  await loginUser(page, user);
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
    await clickSideBarSettingButton(page);
    await page.getByTestId('current-workspace-label').click();
    await page.getByTestId('publish-enable-affine-cloud-button').click();
    await page.getByTestId('confirm-enable-affine-cloud-button').click();
    // wait for upload and delete local workspace
    await page.waitForTimeout(2000);
    await waitForEditorLoad(page);
    await clickNewPageButton(page);
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
});
