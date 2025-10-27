import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/CheckCodeError', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support check code error', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { checkCodeError } = await utils.editor.askAIWithCode(
      page,
      'consloe.log("Hello,World!");',
      'javascript'
    );
    const { answer, responses } = await checkCodeError();
    await expect(answer).toHaveText(/console/);
    await expect(responses).toEqual(
      new Set(['insert-below', 'replace-selection'])
    );
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { checkCodeError } = await utils.editor.askAIWithCode(
      page,
      'consloe.log("Hello,World!");',
      'javascript'
    );
    const { answer } = await checkCodeError();
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
    await expect(panelAnswer).toHaveText(/console/);
    await expect(prompt).toHaveText(/Check the code error of the follow code/);
    await expect(actionName).toHaveText(/Check code error/);
  });
});
