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

  test.skip('should support chat with tag', async ({
    loggedInPage: page,
    utils,
  }) => {
    const randomStr = Math.random().toString(36).substring(2, 6);
    await utils.editor.createTagAndDoc(
      page,
      'Tag 1',
      `Tag${randomStr} is a cute cat`
    );
    await utils.chatPanel.chatWithTags(page, ['Tag 1']);
    await utils.chatPanel.makeChat(
      page,
      `What is Tag${randomStr}(Use English)`
    );
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: `What is Tag${randomStr}(Use English)`,
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(new RegExp(`Tag${randomStr}.*cat`));
      await expect(message.locator('affine-footnote-node')).toHaveCount(1);
    }).toPass();
  });

  // FIXME: This test is flaky, need to fix it.
  test.skip('should support chat with multiple tags', async ({
    loggedInPage: page,
    utils,
  }) => {
    const randomStr1 = Math.random().toString(36).substring(2, 6);
    const randomStr2 = Math.random().toString(36).substring(2, 6);

    await utils.editor.createTagAndDoc(
      page,
      'Tag 2',
      `Tag${randomStr1} is a cute cat`
    );
    await utils.editor.createTagAndDoc(
      page,
      'Tag 3',
      `Tag${randomStr2} is a cute dog`
    );
    await utils.chatPanel.chatWithTags(page, ['Tag 2', 'Tag 3']);
    await utils.chatPanel.makeChat(
      page,
      `What is Tag${randomStr1}? What is Tag${randomStr2}?(Use English)`
    );
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: `What is Tag${randomStr1}? What is Tag${randomStr2}?(Use English)`,
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
    await expect(async () => {
      const { content, message } =
        await utils.chatPanel.getLatestAssistantMessage(page);
      expect(content).toMatch(new RegExp(`Tag${randomStr1}.*cat`));
      expect(content).toMatch(new RegExp(`Tag${randomStr2}.*dog`));
      await expect(message.locator('affine-footnote-node')).toHaveCount(2);
    }).toPass();
  });
});
