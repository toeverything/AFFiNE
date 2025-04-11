import { loginUser } from '@affine-test/kit/utils/cloud';
import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/FixSpelling', () => {
  test.beforeEach(async ({ page, utils }) => {
    const user = await utils.testUtils.getUser();
    await loginUser(page, user);
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support fixing spelling errors in the selected content', async ({
    page,
    utils,
  }) => {
    const { fixSpelling } = await utils.editor.askAIWithText(page, 'Appel');
    const { answer, responses } = await fixSpelling();
    await expect(answer).toHaveText(/Apple/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below', 'replace-selection']));
  });

  test('should support fixing spelling errors in the selected text block in edgeless', async ({
    page,
    utils,
  }) => {
    const { fixSpelling } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(page, 'Appel');
      }
    );

    const { answer, responses } = await fixSpelling();
    await expect(answer).toHaveText(/Apple/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should support fixing spelling errors in the selected note block in edgeless', async ({
    page,
    utils,
  }) => {
    const { fixSpelling } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(page, 'Appel');
      }
    );

    const { answer, responses } = await fixSpelling();
    await expect(answer).toHaveText(/Apple/, { timeout: 10000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should show chat history in chat panel', async ({ page, utils }) => {
    const { fixSpelling } = await utils.editor.askAIWithText(page, 'Appel');
    const { answer } = await fixSpelling();
    await expect(answer).toHaveText(/Apple/, { timeout: 10000 });
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
    await expect(panelAnswer).toHaveText(/Apple/);
    await expect(prompt).toHaveText(/ spelling /);
    await expect(actionName).toHaveText(/Fix spelling for it/);
  });
});
