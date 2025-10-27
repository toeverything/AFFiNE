import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIInsertion/SaveAsDoc', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should save content as a doc in page mode', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.openChatPanel(page);
    await utils.chatPanel.makeChat(page, 'Hello. Answer in 50 words.');

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Hello. Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    // Wait for the assistant answer to be completely rendered
    await page.waitForTimeout(1000);
    const { actions, content } =
      await utils.chatPanel.getLatestAssistantMessage(page);
    await actions.saveAsDoc();
    await page.getByText('New doc created').waitFor({ state: 'visible' });

    // Verify the ai block is created
    const editorContent = await utils.editor.getEditorContent(page);
    expect(editorContent).toBe(content);
  });

  test('should save content as a doc in edgeless mode', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.editor.switchToEdgelessMode(page);

    await utils.chatPanel.openChatPanel(page);
    await utils.chatPanel.makeChat(page, 'Hello. Answer in 50 words.');

    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'Hello. Answer in 50 words.',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);

    // Wait for the assistant answer to be completely rendered
    await page.waitForTimeout(1000);
    const { actions, content } =
      await utils.chatPanel.getLatestAssistantMessage(page);
    await actions.saveAsDoc();
    await page.getByText('New doc created').waitFor({ state: 'visible' });

    // Switch to page mode
    await utils.editor.isPageMode(page);

    // Verify the ai block is created
    const editorContent = await utils.editor.getEditorContent(page);
    expect(editorContent).toBe(content);
  });
});
