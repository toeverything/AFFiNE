import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/WriteAnPoemAboutThis', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should generate an poem for the selected content', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { writePoem } = await utils.editor.askAIWithText(
      page,
      'AFFiNE is a workspace with fully merged docs'
    );
    const { answer, responses } = await writePoem();
    await expect(answer).toHaveText(/AFFiNE/);
    expect(responses).toEqual(new Set(['insert-below', 'replace-selection']));
  });

  test('should generate an poem for the selected text block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { writePoem } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(
          page,
          'AFFiNE is a workspace with fully merged docs'
        );
      }
    );
    const { answer, responses } = await writePoem();
    await expect(answer).toHaveText(/AFFiNE/);
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should generate an poem for the selected note block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { writePoem } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(
          page,
          'AFFiNE is a workspace with fully merged docs'
        );
      }
    );
    const { answer, responses } = await writePoem();
    await expect(answer).toHaveText(/AFFiNE/);
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { writePoem } = await utils.editor.askAIWithText(
      page,
      'AFFiNE is a workspace with fully merged docs'
    );
    const { answer } = await writePoem();
    await expect(answer).toHaveText(/AFFiNE/);
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
    await expect(prompt).toHaveText(/Write a poem about this/);
    await expect(actionName).toHaveText(/Write a poem about this/);
  });
});
