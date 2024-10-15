import { skipOnboarding, test } from '@affine-test/kit/playwright';
import {
  createRandomUser,
  enableCloudWorkspaceFromShareButton,
  enableShare,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { clickEdgelessModeButton } from '@affine-test/kit/utils/editor';
import { importImage } from '@affine-test/kit/utils/image';
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
  await loginUser(page, user);
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

  // enable share page and copy page link
  await enableShare(page);
  await page.getByTestId('share-menu-copy-link-button').click();
  await page.getByTestId('share-link-menu-copy-page').click();

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

test('share page should have toc', async ({ page, browser }) => {
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

  await page.keyboard.type('# Heading 1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('# Heading 2');
  await page.keyboard.press('Enter');

  // enable share page and copy page link
  await enableShare(page);
  await page.getByTestId('share-menu-copy-link-button').click();
  await page.getByTestId('share-link-menu-copy-page').click();

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

    const tocIndicators = page2.locator(
      'affine-outline-viewer .outline-viewer-indicator'
    );
    await expect(tocIndicators).toHaveCount(3);
    await expect(tocIndicators.nth(0)).toBeVisible();
    await expect(tocIndicators.nth(1)).toBeVisible();
    await expect(tocIndicators.nth(2)).toBeVisible();

    const viewer = page2.locator('affine-outline-viewer');
    await tocIndicators.first().hover({ force: true });
    await expect(viewer).toBeVisible();

    const toggleButton = viewer.locator(
      '[data-testid="toggle-outline-panel-button"]'
    );
    await expect(toggleButton).toHaveCount(0);
  }
});

test('append paragraph should be disabled in shared mode', async ({
  page,
  browser,
}) => {
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

  // enable share page and copy page link
  await enableShare(page);
  await page.getByTestId('share-menu-copy-link-button').click();
  await page.getByTestId('share-link-menu-copy-page').click();

  {
    const context = await browser.newContext();
    await skipOnboarding(context);
    const url: string = await page.evaluate(() =>
      navigator.clipboard.readText()
    );
    const page2 = await context.newPage();
    await page2.goto(url);
    await waitForEditorLoad(page2);

    const paragraph = page2.locator('affine-paragraph');
    const numParagraphs = await paragraph.count();

    let error = null;
    try {
      await page2.locator('[data-testid=page-editor-blank]').click();
    } catch (e) {
      error = e;
    }
    expect(error).toBeNull();

    expect(await paragraph.count()).toBe(numParagraphs);
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

  // enable share page and copy page link
  await enableShare(page);
  await page.getByTestId('share-menu-copy-link-button').click();
  await page.getByTestId('share-link-menu-copy-edgeless').click();

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
  }
});

test('image preview should be shown', async ({ page, browser }) => {
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

  // enable share page and copy page link
  await enableShare(page);
  await page.getByTestId('share-menu-copy-link-button').click();
  await page.getByTestId('share-link-menu-copy-page').click();

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

test('The reference links in the shared page should be accessible normally and can go back and forward', async ({
  page,
  browser,
}) => {
  await page.reload();
  await waitForEditorLoad(page);
  await createLocalWorkspace(
    {
      name: 'test',
    },
    page
  );
  await enableCloudWorkspaceFromShareButton(page);

  // create linked page and share
  const title = getBlockSuiteEditorTitle(page);
  await title.pressSequentially('Test linked doc', {
    delay: 50,
  });
  await page.keyboard.press('Enter', { delay: 50 });
  await page.keyboard.type('Test linked content', { delay: 50 });
  await enableShare(page);

  // create a new page and link to the shared page
  await clickNewPageButton(page, 'Test Page');
  await waitForEditorLoad(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('@', { delay: 50 });
  const linkedPagePopover = page.locator('.linked-doc-popover');
  await expect(linkedPagePopover).toBeVisible();
  await page.keyboard.type('Test linked doc', { delay: 50 });
  await page.keyboard.press('Enter');

  // enable share page and copy page link
  await enableShare(page);
  await page.getByTestId('share-menu-copy-link-button').click();
  await page.getByTestId('share-link-menu-copy-page').click();

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
    await expect(title).toContainText('Test Page');

    // check linked page
    const link = page2.locator('.affine-reference');
    await expect(link).toBeVisible();
    await expect(link).toContainText('Test linked doc');
    await link.click();
    await waitForEditorLoad(page2);
    await expect(
      page2.locator('.doc-title-container:has-text("Test linked doc")')
    ).toBeVisible();
    await expect(page2.locator('affine-paragraph').first()).toContainText(
      'Test linked content'
    );

    // go back and forward
    await page2.goBack();
    await waitForEditorLoad(page2);
    await expect(title).toContainText('Test Page');
    await expect(link).toBeVisible();
    await expect(link).toContainText('Test linked doc');

    await page2.goForward();
    await waitForEditorLoad(page2);
    await expect(
      page2.locator('.doc-title-container:has-text("Test linked doc")')
    ).toBeVisible();
    await expect(page2.locator('affine-paragraph').first()).toContainText(
      'Test linked content'
    );
  }
});
