import { skipOnboarding, test } from '@affine-test/kit/playwright';
import { importAttachment } from '@affine-test/kit/utils/attachment';
import {
  createRandomUser,
  enableCloudWorkspaceFromShareButton,
  enableShare,
  loginUser,
} from '@affine-test/kit/utils/cloud';
import { getParagraphIds, locateToolbar } from '@affine-test/kit/utils/editor';
import { copyByKeyboard } from '@affine-test/kit/utils/keyboard';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { setSelection } from '@affine-test/kit/utils/selection';
import { createLocalWorkspace } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

let user: {
  id: string;
  name: string;
  email: string;
  password: string;
};

test.beforeEach(async ({ page }) => {
  user = await createRandomUser();
  await loginUser(page, user);
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
  await page.locator('icon-button:has-text("Test linked doc")').first().click();

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

test('Should show no permission page when the share page is not found', async ({
  page,
}) => {
  await page.goto('http://localhost:8080/workspace/abc/123');

  await expect(
    page.getByText('You do not have access or this content does not exist.')
  ).toBeVisible();
});

test('Inline latex modal should be not shown in shared mode when clicking', async ({
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
  await page.keyboard.press('Enter', { delay: 50 });

  await page.keyboard.type('$$E=mc^2$$');
  await page.keyboard.press('Space');

  // there should be a inline latex node
  const latexLocator = page.locator('affine-latex-node');
  await expect(latexLocator).toBeVisible();

  // click the latex node
  // the latex editor should be shown when the doc can be editing
  await latexLocator.click();
  const modalLocator = page.locator('.latex-editor-container');
  await expect(modalLocator).toBeVisible();

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

    // click the latex node
    const latexLocator = page2.locator('affine-latex-node');
    await latexLocator.click();

    // the latex editor should not be shown when the doc is readonly
    const modalLocator = page2.locator('.latex-editor-container');
    await expect(modalLocator).not.toBeVisible();
  }
});

test('share page should support copying content', async ({ page, browser }) => {
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
  await page.keyboard.type('Hello World');

  // enable share page and copy page link
  await enableShare(page);
  await page.getByTestId('share-menu-copy-link-button').click();
  await page.getByTestId('share-link-menu-copy-page').click();

  // check share page is accessible and content can be copied
  {
    const context = await browser.newContext();
    await skipOnboarding(context);
    const url: string = await page.evaluate(() =>
      navigator.clipboard.readText()
    );
    const page2 = await context.newPage();
    await page2.goto(url);
    await waitForEditorLoad(page2);

    const { blockIds: paragraphIds } = await getParagraphIds(page2);
    await setSelection(page2, paragraphIds[0], 0, paragraphIds[0], 11);
    await copyByKeyboard(page2);

    // Verify copied content
    const copiedText = await page2.evaluate(() =>
      navigator.clipboard.readText()
    );
    expect(copiedText).toContain('Hello World');
  }
});

test('should enable opening peek view with pdf viewer in readonly and sharing modes', async ({
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
  await title.click();
  await page.keyboard.press('Enter');
  await importAttachment(page, 'lorem-ipsum.pdf');

  const toolbar = locateToolbar(page);
  const switchViewButton = toolbar.getByLabel('Switch view');
  const embedViewButton = toolbar.getByLabel('Embed view');

  const attachment = page.locator('affine-attachment');
  await attachment.click();

  await switchViewButton.click();
  await embedViewButton.click();

  await expect(attachment.locator('lit-react-portal')).toBeVisible();

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

    const attachment = page2.locator('affine-attachment');

    await expect(attachment.locator('lit-react-portal')).toBeVisible();

    await attachment.dblclick();

    const pdfViewer = page2.getByTestId('pdf-viewer');
    await expect(pdfViewer).not.toBeVisible();
  }
});
