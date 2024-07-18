import { skipOnboarding, test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  enableCloudWorkspaceFromShareButton,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { clickEdgelessModeButton } from '@affine-test/kit/utils/editor';
import { importImage } from '@affine-test/kit/utils/image';
import {
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

test('can enable share page', async ({ page, browser }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspaceFromShareButton(page);
  const title = getBlockSuiteEditorTitle(page);
  await title.pressSequentially('TEST TITLE', {
    delay: 50,
  });
  await page.keyboard.press('Enter', { delay: 50 });
  await page.keyboard.type('TEST CONTENT', { delay: 50 });
  await page.getByTestId('cloud-share-menu-button').click();
  await page.getByTestId('share-menu-create-link-button').click();
  await page.getByTestId('share-menu-copy-link-button').click();

  // check share page is accessible
  {
    const context = await browser.newContext();
    await skipOnboarding(context);
    const url: string = await page.evaluate(() =>
      navigator.clipboard.readText()
    );
    const page2 = await context.newPage();
    await page2.goto(url);
    await waitForEditorLoad(page2);
    const title = getBlockSuiteEditorTitle(page2);
    await expect(title).toContainText('TEST TITLE');
    expect(page2.locator('affine-paragraph').first()).toContainText(
      'TEST CONTENT'
    );
  }
});

test('share page with default edgeless', async ({ page, browser }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspaceFromShareButton(page);
  const title = getBlockSuiteEditorTitle(page);
  await title.pressSequentially('TEST TITLE', {
    delay: 50,
  });
  await page.keyboard.press('Enter', { delay: 50 });
  await page.keyboard.type('TEST CONTENT', { delay: 50 });
  await clickEdgelessModeButton(page);
  await expect(page.locator('affine-edgeless-root')).toBeVisible({
    timeout: 1000,
  });
  await page.getByTestId('cloud-share-menu-button').click();
  await page.getByTestId('share-menu-create-link-button').click();
  await page.getByTestId('share-menu-copy-link-button').click();

  // check share page is accessible
  {
    const context = await browser.newContext();
    await skipOnboarding(context);
    const url: string = await page.evaluate(() =>
      navigator.clipboard.readText()
    );
    const page2 = await context.newPage();
    await page2.goto(url);
    await waitForEditorLoad(page2);
    await expect(page.locator('affine-edgeless-root')).toBeVisible({
      timeout: 1000,
    });
    expect(page2.locator('affine-paragraph').first()).toContainText(
      'TEST CONTENT'
    );
    const editButton = page2.getByTestId('share-page-edit-button');
    await expect(editButton).not.toBeVisible();
  }
});

test('image preview should should be shown', async ({ page, browser }) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspaceFromShareButton(page);
  const title = getBlockSuiteEditorTitle(page);
  await title.click();
  await page.keyboard.press('Enter');
  await importImage(page, 'http://localhost:8081/large-image.png');

  await page.getByTestId('cloud-share-menu-button').click();
  await page.getByTestId('share-menu-create-link-button').click();
  await page.getByTestId('share-menu-copy-link-button').click();

  // check share page is accessible
  {
    const context = await browser.newContext();
    await skipOnboarding(context);
    const url: string = await page.evaluate(() =>
      navigator.clipboard.readText()
    );
    const page2 = await context.newPage();
    await page2.goto(url);
    await waitForEditorLoad(page2);

    await page.locator('affine-page-image').first().dblclick();
    const locator = page.getByTestId('image-preview-modal');
    await expect(locator).toBeVisible();
    await page.getByTestId('image-preview-close-button').first().click();
    await page.waitForTimeout(500);
    await expect(locator).not.toBeVisible();
  }
});
