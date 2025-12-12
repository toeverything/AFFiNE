import type { EdgelessRootBlockComponent } from '@blocksuite/affine/blocks/root';
import type { GfxModel } from '@blocksuite/std/gfx';
import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIChatWith/EdgelessMindMap', () => {
  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should support replace mindmap with the regenerated one', async ({
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

    const { answer } = await regenerateMindMap();
    await expect(answer.locator('mini-mindmap-preview')).toBeVisible();
    const replace = answer.getByTestId('answer-replace');
    await replace.click();

    // Expect original mindmap to be replaced
    const mindmaps = await page.evaluate(() => {
      const edgelessBlock = document.querySelector(
        'affine-edgeless-root'
      ) as EdgelessRootBlockComponent;
      const mindmaps = edgelessBlock?.gfx.gfxElements
        .filter((el: GfxModel) => 'type' in el && el.type === 'mindmap')
        .map((el: GfxModel) => el.id);
      return mindmaps;
    });
    expect(mindmaps).toHaveLength(1);
    expect(mindmaps?.[0]).not.toBe(id!);
  });
});
