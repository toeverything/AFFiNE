import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/MakeItShorter', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support making the selected content shorter', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { makeItShorter } = await utils.editor.askAIWithText(
      page,
      'AFFiNE is a workspace with fully merged docs'
    );
    const { answer, responses } = await makeItShorter();
    await expect(answer).toHaveText(/AFFiNE/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below', 'replace-selection']));
  });

  test('should support making the selected text block shorter in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { makeItShorter } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(
          page,
          'AFFiNE is a workspace with fully merged docs'
        );
      }
    );
    const { answer, responses } = await makeItShorter();
    await expect(answer).toHaveText(/AFFiNE/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should support making the selected note block shorter in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { makeItShorter } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(
          page,
          'AFFiNE is a workspace with fully merged docs'
        );
      }
    );
    const { answer, responses } = await makeItShorter();
    await expect(answer).toHaveText(/AFFiNE/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { makeItShorter } = await utils.editor.askAIWithText(
      page,
      'AFFiNE is a workspace with fully merged docs'
    );
    const { answer } = await makeItShorter();
    await expect(answer).toHaveText(/AFFiNE/, { timeout: 10000 });
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
    await expect(prompt).toHaveText(/Shorten the follow text/);
    await expect(actionName).toHaveText(/Make it shorter/);
  });
});
