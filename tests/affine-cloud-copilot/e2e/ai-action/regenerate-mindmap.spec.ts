import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIAction/RegenerateMindMap', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support regenerate the mind map for mindmap root', async ({
    loggedInPage: page,
    utils,
  }) => {
    let id: string;
    const { regenerateMindMap } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        id = await utils.editor.createMindmap(page);
      },
      async () => {
        const { id: rootId } = await utils.editor.getMindMapNode(
          page,
          id!,
          [0]
        );
        await utils.editor.selectElementInEdgeless(page, [rootId]);
      }
    );

    const { answer, responses } = await regenerateMindMap();
    await expect(answer.locator('mini-mindmap-preview')).toBeVisible();
    expect(responses).toEqual(new Set(['replace-selection']));
  });
});
