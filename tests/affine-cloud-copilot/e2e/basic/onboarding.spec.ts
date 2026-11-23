import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe.configure({ mode: 'parallel' });

test.describe('AIBasic/Onboarding', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should show AI onboarding', async ({ loggedInPage: page }) => {
    await expect(page.getByTestId('ai-onboarding')).toBeVisible();

    // Show options
    await expect(
      page.getByTestId('read-foreign-language-article-with-ai')
    ).toBeVisible();
    await expect(
      page.getByTestId('tidy-an-article-with-ai-mindmap-action')
    ).toBeVisible();
    await expect(
      page.getByTestId('add-illustrations-to-the-article')
    ).toBeVisible();
    await expect(page.getByTestId('complete-writing-with-ai')).toBeVisible();
    await expect(page.getByTestId('freely-communicate-with-ai')).toBeVisible();
  });

  test('read a foreign language article with AI', async ({
    loggedInPage: page,
    utils,
  }) => {
    await page.getByTestId('read-foreign-language-article-with-ai').click();

    await utils.editor.isEdgelessMode(page);
    const docTitle = await utils.editor.getDocTitle(page);
    await expect(docTitle).toContain('Read a foreign language');
  });

  test('tidy an article with AI MindMap Action', async ({
    loggedInPage: page,
    utils,
  }) => {
    await page.getByTestId('tidy-an-article-with-ai-mindmap-action').click();

    await utils.editor.isEdgelessMode(page);
    const docTitle = await utils.editor.getDocTitle(page);
    await expect(docTitle).toContain('Tidy');
  });

  test('add illustrations to the article', async ({
    loggedInPage: page,
    utils,
  }) => {
    await page.getByTestId('add-illustrations-to-the-article').click();

    await utils.editor.isEdgelessMode(page);
    const docTitle = await utils.editor.getDocTitle(page);
    await expect(docTitle).toContain('Add illustrations');
  });

  test('complete writing with AI', async ({ loggedInPage: page, utils }) => {
    await page.getByTestId('complete-writing-with-ai').click();

    await utils.editor.isEdgelessMode(page);
    const docTitle = await utils.editor.getDocTitle(page);
    await expect(docTitle).toContain('Complete writing');
  });

  test('freely communicate with AI', async ({ loggedInPage: page, utils }) => {
    await page.getByTestId('freely-communicate-with-ai').click();

    await utils.editor.isEdgelessMode(page);
    const docTitle = await utils.editor.getDocTitle(page);
    await expect(docTitle).toContain('Freely communicate');
  });
});
