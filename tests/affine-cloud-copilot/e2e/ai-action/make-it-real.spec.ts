import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/MakeItReal', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support making the selected content to real', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { makeItReal } = await utils.editor.askAIWithText(page, 'Hello');
    const { answer, responses } = await makeItReal();
    await expect(answer.locator('iframe')).toBeVisible({ timeout: 30000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should support making the selected text block to real in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { makeItReal } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(page, 'Hello');
      }
    );
    const { answer, responses } = await makeItReal();
    await expect(answer.locator('iframe')).toBeVisible({ timeout: 30000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should support making the selected note block to real in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { makeItReal } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(page, 'Hello');
      }
    );
    const { answer, responses } = await makeItReal();
    await expect(answer.locator('iframe')).toBeVisible({ timeout: 30000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should support making the selected element to real in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { makeItReal } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createShape(page, 'HelloWorld');
      }
    );

    const { answer, responses } = await makeItReal();
    await expect(answer.locator('iframe')).toBeVisible({ timeout: 30000 });
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { makeItReal } = await utils.editor.askAIWithText(page, 'Hello');
    const { answer } = await makeItReal();
    const insert = answer.getByTestId('answer-insert-below');
    await insert.click();
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
    await expect(panelAnswer.locator('affine-code')).toBeVisible();
    await expect(prompt).toHaveText(/Write a web page of follow text/);
    await expect(actionName).toHaveText(/Make it real with text/);
  });
});
