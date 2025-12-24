import { test } from '../base/base-test';

test.describe('AIChatWith/Reasoning', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test.skip('should support chat with reasoning', async ({
    loggedInPage: page,
    utils,
  }) => {
    await utils.chatPanel.enableReasoning(page);
    await utils.chatPanel.makeChat(
      page,
      'How do you measure exactly 4 liters of water using a jug that only holds 3 and 5 liters?'
    );
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'user',
        content:
          'How do you measure exactly 4 liters of water using a jug that only holds 3 and 5 liters?',
      },
      {
        role: 'assistant',
        status: 'success',
      },
    ]);
  });
});
