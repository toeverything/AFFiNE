import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/FixGrammar', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support fixing grammatical errors in the selected content', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { fixGrammar } = await utils.editor.askAIWithText(
      page,
      'I is a student'
    );
    const { answer, responses } = await fixGrammar();
    await expect(answer).toHaveText(/I am a student/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below', 'replace-selection']));
  });

  test('should support fixing grammatical errors in the selected text block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { fixGrammar } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(page, 'I is a student');
      }
    );

    const { answer, responses } = await fixGrammar();
    await expect(answer).toHaveText(/I am a student/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should support fixing grammatical errors in the selected note block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { fixGrammar } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(page, 'I is a student');
      }
    );

    const { answer, responses } = await fixGrammar();
    await expect(answer).toHaveText(/I am a student/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { fixGrammar } = await utils.editor.askAIWithText(
      page,
      'I is a student'
    );
    const { answer } = await fixGrammar();
    await expect(answer).toHaveText(/I am a student/, { timeout: 10000 });
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
    await expect(panelAnswer).toHaveText(/I am a student/);
    await expect(prompt).toHaveText(
      /Improve the grammar of the following text/
    );
    await expect(actionName).toHaveText(/Improve grammar for it/);
  });
});
