import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIInsertion/SaveAsBlock', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should save content as a chat block in page mode', async ({
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

    const { actions } = await utils.chatPanel.getLatestAssistantMessage(page);
    await actions.saveAsBlock();

    // Switch to edgeless mode
    await utils.editor.isEdgelessMode(page);

    // Verify the ai block is created
    await page.waitForSelector('affine-edgeless-ai-chat');
    const aiBlock = await page.locator('affine-edgeless-ai-chat');
    await expect(aiBlock).toBeVisible();
  });

  test('should save content as a chat block in edgeless mode', async ({
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

    const { actions } = await utils.chatPanel.getLatestAssistantMessage(page);
    await actions.saveAsBlock();
    await page.getByText('Successfully saved chat to a block');

    // Verify the ai block is created
    await page.waitForSelector('affine-edgeless-ai-chat');
    const aiBlock = await page.locator('affine-edgeless-ai-chat');
    await expect(aiBlock).toBeVisible();
  });
});
