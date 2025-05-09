import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe.configure({ mode: 'serial' });

test.describe('AIChatWith/tags', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
    await utils.editor.clearAllTags(page);
    await utils.testUtils.createNewPage(page);
  });

  test.afterEach(async ({ loggedInPage: page, utils }) => {
    await utils.editor.clearAllTags(page);
  });

  test('should support chat with tag', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.editor.createTagAndDoc(page, 'Tag 1', 'TagAAaa is a cute cat');
    await utils.chatPanel.chatWithTags(page, ['Tag 1']);
    await utils.chatPanel.makeChat(page, 'What is TagAAaa(Use English)');
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What is TagAAaa(Use English)',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(/TagAAaa.*cat/);
      await expect(message.locator('affine-footnote-node')).toHaveCount(1);
    }).toPass();
  });

  test('should support chat with multiple tags', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.editor.createTagAndDoc(page, 'Tag 2', 'TagEEee is a cute cat');
    await utils.editor.createTagAndDoc(page, 'Tag 3', 'TagFFff is a cute dog');
    await utils.chatPanel.chatWithTags(page, ['Tag 2', 'Tag 3']);
    await utils.chatPanel.makeChat(
      page,
      'What is TagEEee? What is TagFFff?(Use English)'
    );
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What is TagEEee? What is TagFFff?(Use English)',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(/TagEEee.*cat/);
      expect(content).toMatch(/TagFFff.*dog/);
      await expect(message.locator('affine-footnote-node')).toHaveCount(2);
    }).toPass();
  });
});
