import { test } from '../base/base-test';

test.describe('AIChatWith/Network', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test.skip('should support chat with network if network search enabled', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.makeChat(
      page,
      'What is the weather like in Shanghai today?'
    );
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content: 'What is the weather like in Shanghai today?',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
  });
});
