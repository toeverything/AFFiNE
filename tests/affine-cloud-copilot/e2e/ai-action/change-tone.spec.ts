import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/ChangeTone', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support changing the tone of the selected content', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { changeTone } = await utils.editor.askAIWithText(
      page,
      'AFFiNE is a great note-taking app'
    );
    const { answer, responses } = await changeTone('informal');
    await expect(answer).toHaveText(/AFFiNE/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below', 'replace-selection']));
  });

  test('should support changing the tone of the selected text block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { changeTone } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(
          page,
          'AFFiNE is a great note-taking app'
        );
      }
    );

    const { answer, responses } = await changeTone('informal');
    await expect(answer).toHaveText(/AFFiNE/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should support changing the tone of the selected note block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { changeTone } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(
          page,
          'AFFiNE is a great note-taking app'
        );
      }
    );

    const { answer, responses } = await changeTone('informal');
    await expect(answer).toHaveText(/AFFiNE/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { changeTone } = await utils.editor.askAIWithText(
      page,
      'AFFiNE is a great note-taking app'
    );
    const { answer } = await changeTone('informal');
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
    await expect(panelAnswer).toHaveText(/AFFiNE/);
    await expect(prompt).toHaveText(/Change tone/);
    await expect(actionName).toHaveText(/Change tone/);
  });
});
