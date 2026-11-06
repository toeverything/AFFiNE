import type { EdgelessRootBlockComponent } from '@blocksuite/affine/blocks/root';
import type { GfxModel } from '@blocksuite/std/gfx';
import { expect } from '@playwright/test';

import { test } from '../base/base-test';

test.describe('AIChatWith/EdgelessMindMap', () => {
  test.describe.configure({ timeout: 180000 });

  test.beforeEach(async ({ loggedInPage: page, utils }) => {
    await utils.testUtils.setupTestEnvironment(page);
    await utils.chatPanel.openChatPanel(page);
  });

  test('should preview the regenerated mindmap before replacing it', async ({
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
    expect(responses).toEqual(new Set(['replace-selection']));
    const preview = answer.locator('mini-mindmap-preview');
    const surface = preview
      .locator('mini-mindmap-root-block')
      .locator('mini-mindmap-surface-block')
      .locator('.affine-mini-mindmap-surface');
    await expect(surface).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(
        () =>
          surface
            .locator('canvas:visible')
            .evaluateAll<boolean, HTMLCanvasElement>(canvases =>
              canvases.some(canvas => {
                const { width, height } = canvas;
                if (!width || !height) return false;

                const pixels = canvas
                  .getContext('2d')
                  ?.getImageData(0, 0, width, height).data;
                return pixels?.some(
                  (value, index) => index % 4 === 3 && value > 0
                );
              })
            ),
        {
          message: 'Mind map preview should draw visible pixels',
          timeout: 15_000,
        }
      )
      .toBe(true);
    const replace = answer.getByTestId('answer-replace');
    await expect(replace).toBeVisible();
    await replace.click({ force: true });

    await expect
      .poll(
        () =>
          page.evaluate(originalId => {
            const edgelessBlock = document.querySelector(
              'affine-edgeless-root'
            ) as EdgelessRootBlockComponent;
            const mindmaps = edgelessBlock?.gfx.gfxElements.filter(
              (el: GfxModel) => 'type' in el && el.type === 'mindmap'
            ) as unknown as Array<{
              id: string;
              tree: { children?: unknown[] };
            }>;
            const mindmap = mindmaps?.[0];

            return {
              count: mindmaps?.length ?? 0,
              replaced: !!mindmap && mindmap.id !== originalId,
              hasChildren: (mindmap?.tree.children?.length ?? 0) > 0,
            };
          }, id!),
        { timeout: 15_000 }
      )
      .toEqual({ count: 1, replaced: true, hasChildren: true });
  });
});
