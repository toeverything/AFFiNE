import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/ExplainSelection', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support explaining the selected content', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { explainSelection } = await utils.editor.askAIWithText(
      page,
      'LLM(AI)'
    );
    const { answer, responses } = await explainSelection();
    await expect(answer).toHaveText(/Large Language Model/, { timeout: 20000 });
    expect(responses).toEqual(new Set(['insert-below', 'replace-selection']));
  });

  test('should support explaining the selected text block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { explainSelection } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(page, 'LLM(AI)');
      }
    );

    const { answer, responses } = await explainSelection();
    await expect(answer).toHaveText(/Large Language Model/, { timeout: 20000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should support explaining the selected note block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { explainSelection } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(page, 'LLM(AI)');
      }
    );

    const { answer, responses } = await explainSelection();
    await expect(answer).toHaveText(/Large Language Model/, { timeout: 20000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { explainSelection } = await utils.editor.askAIWithText(page, 'LLM');
    const { answer } = await explainSelection();
    const replace = answer.getByTestId('answer-replace');
    await replace.click();
    await utils.chatPanel.waitForHistory(page, [
      {
        role: 'action',
      },
    ]);
    const {
      answer: panelAnswer,
      prompt,
      actionName,
    } = await utils.chatPanel.getLatestAIActionMessage(page);
    await expect(panelAnswer).toHaveText(/Large Language Model/);
    await expect(prompt).toHaveText(/Analyze and explain the follow text/);
    await expect(actionName).toHaveText(/Explain this/);
  });
});
