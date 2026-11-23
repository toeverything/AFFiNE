import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/FindActions', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should find actions for selected content', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { findActions } = await utils.editor.askAIWithText(
      page,
      `Choose a Booking Platform
Enter Travel Details
Compare and Select Flights`
    );
    const { answer, responses } = await findActions();
    const todos = await answer.locator('affine-list').all();

    const expectedTexts = [
      /Choose a Booking Platform/i,
      /Enter Travel Details/i,
      /Compare and Select Flights/i,
    ];

    await Promise.all(
      todos.map(async (todo, index) => {
        await expect(
          todo.locator('.affine-list-block__todo-prefix')
        ).toBeVisible();
        await expect(todo).toHaveText(expectedTexts[index]);
      })
    );
    expect(responses).toEqual(new Set(['insert-below', 'replace-selection']));
  });

  test('should find actions for selected text block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { findActions } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(
          page,
          'Choose a Booking Platform'
        );
      }
    );

    const { answer, responses } = await findActions();
    const todos = await answer.locator('affine-list').all();
    const expectedTexts = [
      /Choose a Booking Platform/i,
      /Enter Travel Details/i,
      /Compare and Select Flights/i,
    ];
    await Promise.all(
      todos.map(async (todo, index) => {
        await expect(
          todo.locator('.affine-list-block__todo-prefix')
        ).toBeVisible();
        await expect(todo).toHaveText(expectedTexts[index]);
      })
    );
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should find actions for selected note block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { findActions } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(
          page,
          'Choose a Booking Platform'
        );
      }
    );

    const { answer, responses } = await findActions();
    const todos = await answer.locator('affine-list').all();
    const expectedTexts = [
      /Choose a Booking Platform/i,
      /Enter Travel Details/i,
      /Compare and Select Flights/i,
    ];
    await Promise.all(
      todos.map(async (todo, index) => {
        await expect(
          todo.locator('.affine-list-block__todo-prefix')
        ).toBeVisible();
        await expect(todo).toHaveText(expectedTexts[index]);
      })
    );
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test.skip('should show chat history in chat panel', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { findActions } = await utils.editor.askAIWithText(
      page,
      `Choose a Booking Platform
Enter Travel Details
Compare and Select Flights`
    );
    const { answer } = await findActions();
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
    const todos = await panelAnswer.locator('affine-list').all();

    const expectedTexts = [
      /Choose a Booking Platform/i,
      /Enter Travel Details/i,
      /Compare and Select Flights/i,
    ];
    await Promise.all(
      todos.map(async (todo, index) => {
        await expect(
          todo.locator('.affine-list-block__todo-prefix')
        ).toBeVisible();
        await expect(todo).toHaveText(expectedTexts[index]);
      })
    );
    await expect(prompt).toHaveText(/Find action items of the follow text/);
    await expect(actionName).toHaveText(/Find action items from it/);
  });
});
