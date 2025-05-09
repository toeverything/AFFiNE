import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe.configure({ mode: 'serial' });

test.describe('AIChatWith/Collections', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
    await utils.editor.clearAllCollections(page);

    await utils.testUtils.createNewPage(page);
  });

  test.afterEach(async ({ loggedInPage: page, utils }) => {
    // clear all collections
    await utils.editor.clearAllCollections(page);
  });

  test('should support chat with collection', async ({
    loggedInPage: page,
    utils,
  }) => {
    // Create two collections
    await utils.editor.createCollectionAndDoc(
      page,
      'Collection 1',
      'CollectionAAaa is a cute dog'
    );

    await utils.chatPanel.chatWithCollections(page, ['Collection 1']);
    await utils.chatPanel.makeChat(page, 'What is CollectionAAaa(Use English)');
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What is CollectionAAaa(Use English)',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(/CollectionAAaa.*dog/);
      expect(await message.locator('affine-footnote-node').count()).toBe(1);
    }).toPass();
  });

  test('should support chat with multiple collections', async ({
    loggedInPage: page,
    utils,
  }) => {
    // Create two collections
    await utils.editor.createCollectionAndDoc(
      page,
      'Collection 2',
      'CollectionEEee is a cute cat'
    );

    await utils.editor.createCollectionAndDoc(
      page,
      'Collection 3',
      'CollectionFFff is a cute dog'
    );

    await utils.chatPanel.chatWithCollections(page, [
      'Collection 2',
      'Collection 3',
    ]);
    await utils.chatPanel.makeChat(
      page,
      'What is CollectionEEee? What is CollectionFFff?(Use English)'
    );
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What is CollectionEEee? What is CollectionFFff?(Use English)',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(/CollectionEEee.*cat/);
      expect(content).toMatch(/CollectionFFff.*dog/);
      expect(await message.locator('affine-footnote-node').count()).toBe(2);
    }).toPass();
  });
});
