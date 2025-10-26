import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/ExplainCode', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support explain code', async ({ loggedInPage: page, utils }) => {
    const { explainCode } = await utils.editor.askAIWithCode(
      page,
      'console.log("Hello, World!");',
      'javascript'
    );
    const { answer } = await explainCode();
    await expect(answer).toHaveText(/console.log/);
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { explainCode } = await utils.editor.askAIWithCode(
      page,
      'console.log("Hello, World!");',
      'javascript'
    );
    const { answer } = await explainCode();
    const insert = answer.getByTestId('answer-insert-below');
    await insert.click();
    await utils.chatPanel.waitForHistory(page, [{ role: 'action' }]);
    const {
      message,
      answer: panelAnswer,
      prompt,
      actionName,
    } = await utils.chatPanel.getLatestAIActionMessage(page);
    await expect(
      message.getByTestId('original-text').locator('affine-code')
    ).toBeVisible();
    await expect(panelAnswer).toHaveText(/console.log/);
    await expect(prompt).toHaveText(/Analyze and explain the follow code/);
    await expect(actionName).toHaveText(/Explain this code/);
  });
});
