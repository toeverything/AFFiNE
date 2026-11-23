import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/ContinueWriting', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support continue writing the selected content', async ({
    loggedInPage: page,
    utils,
  }) => {
    await page.setViewportSize({ width: 1280, height: 2000 });
    const { continueWriting } = await utils.editor.askAIWithText(
      page,
      'AFFiNE is a workspace with fully merged docs'
    );
    const { answer, responses } = await continueWriting();
    await expect(answer).toHaveText(/,*/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below', 'replace-selection']));
  });

  test('should support continue writing the selected text block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { continueWriting } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(
          page,
          'AFFiNE is a workspace with fully merged docs'
        );
      }
    );

    const { answer, responses } = await continueWriting();
    await expect(answer).toHaveText(/,*/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should support continue writing the selected note block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { continueWriting } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(
          page,
          'AFFiNE is a workspace with fully merged docs'
        );
      }
    );

    const { answer, responses } = await continueWriting();
    await expect(answer).toHaveText(/,*/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { continueWriting } = await utils.editor.askAIWithText(
      page,
      'AFFiNE is a workspace with fully merged docs'
    );
    const { answer } = await continueWriting();
    const insert = answer.getByTestId('answer-insert-below');
    await insert.click();
    await utils.chatPanel.waitForHistory(
      page,
      [
        {
          role: 'action',
        },
      ],
      10000
    );
    const {
      answer: panelAnswer,
      prompt,
      actionName,
    } = await utils.chatPanel.getLatestAIActionMessage(page);
    await expect(panelAnswer).toHaveText(/,*/);
    await expect(prompt).toHaveText(/Continue the following text/);
    await expect(actionName).toHaveText(/Continue writing/);
  });
});
