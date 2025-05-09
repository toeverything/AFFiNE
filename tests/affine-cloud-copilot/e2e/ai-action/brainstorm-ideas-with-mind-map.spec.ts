import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/BrainstormIdeasWithMindMap', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should generate a mind map for the selected content', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { brainstormMindMap } = await utils.editor.askAIWithText(
      page,
      'Panda'
    );
    const { answer, responses } = await brainstormMindMap();
    await expect(answer.locator('mini-mindmap-preview')).toBeVisible();
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should generate a mind map for the selected text block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { brainstormMindMap } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessText(page, 'Panda');
      }
    );
    const { answer, responses } = await brainstormMindMap();
    await expect(answer.locator('mini-mindmap-preview')).toBeVisible();
    expect(responses).toEqual(new Set(['insert-below']));
  });

  test('should generate a mind map for the selected note block in edgeless', async ({
    loggedInPage: page,
    utils,
  }) => {
    const { brainstormMindMap } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        await utils.editor.createEdgelessNote(page, 'Panda');
      }
    );
    const { answer, responses } = await brainstormMindMap();
    await expect(answer.locator('mini-mindmap-preview')).toBeVisible();
    expect(responses).toEqual(new Set(['insert-below']));
  });
});
