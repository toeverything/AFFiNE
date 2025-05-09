import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('expand mindmap node', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should expand the mindmap node', async ({
    loggedInPage: page,
    utils,
  }) => {
    let id: string;
    const { expandMindMapNode } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        id = await utils.editor.createMindmap(page);
      },
      async () => {
        // Select the first child in the mindmap
        const { id: childId } = await utils.editor.getMindMapNode(
          page,
          id!,
          [0, 0]
        );
        await utils.editor.selectElementInEdgeless(page, [childId]);
      }
    );
    await expandMindMapNode();
    // Child node should be expanded
    await expect(async () => {
      const newChild = await utils.editor.getMindMapNode(page, id!, [0, 0, 0]);
      expect(newChild).toBeDefined();
    }).toPass({ timeout: 20000 });
  });
});
