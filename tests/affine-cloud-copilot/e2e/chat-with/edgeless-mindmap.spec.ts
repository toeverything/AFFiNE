import type { EdgelessRootBlockComponent } from '@blocksuite/affine/blocks/root';
import type { GfxModel } from '@blocksuite/std/gfx';
import { expect } from '@playwright/test';

import { test } from '../base/base-test';

type MindmapSnapshot = {
  childCount: number;
  count: number;
  id: string | null;
};

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
    let originalChildCount: number;
    const { regenerateMindMap } = await utils.editor.askAIWithEdgeless(
      page,
      async () => {
        id = await utils.editor.createMindmap(page);
        originalChildCount = await page.evaluate(mindmapId => {
          const edgelessBlock = document.querySelector(
            'affine-edgeless-root'
          ) as EdgelessRootBlockComponent;
          const mindmap = edgelessBlock.gfx.getElementById(mindmapId) as {
            tree: { children?: unknown[] };
          } | null;
          return mindmap?.tree.children?.length ?? 0;
        }, id);
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
    await expect
      .poll(
        async () => {
          return answer
            .locator('mini-mindmap-preview')
            .evaluate(async preview => {
              const walk = (root: ParentNode): Element[] => {
                const results: Element[] = [];

                for (const element of root.querySelectorAll('*')) {
                  results.push(element);
                  if (element.shadowRoot) {
                    results.push(...walk(element.shadowRoot));
                  }
                }

                return results;
              };

              await customElements.whenDefined('mini-mindmap-preview');

              const previewElement =
                preview instanceof HTMLElement
                  ? (preview as HTMLElement & {
                      updateComplete?: Promise<unknown>;
                    })
                  : null;

              await previewElement?.updateComplete;
              await new Promise(resolve =>
                requestAnimationFrame(() => resolve(null))
              );

              const shadowRoot = previewElement?.shadowRoot ?? null;
              const descendants = walk(shadowRoot ?? preview);
              const surface = descendants.find(
                element =>
                  element instanceof HTMLElement &&
                  element.classList.contains('affine-mini-mindmap-surface')
              ) as HTMLElement | undefined;
              const surfaceRect = surface?.getBoundingClientRect();

              return {
                hasShadowRoot: !!shadowRoot,
                hasRootBlock: descendants.some(
                  element =>
                    element.tagName.toLowerCase() === 'mini-mindmap-root-block'
                ),
                hasSurfaceBlock: descendants.some(
                  element =>
                    element.tagName.toLowerCase() ===
                    'mini-mindmap-surface-block'
                ),
                surfaceReady:
                  !!surface &&
                  (surfaceRect?.width ?? 0) > 0 &&
                  (surfaceRect?.height ?? 0) > 0,
              };
            });
        },
        { timeout: 15_000 }
      )
      .toEqual({
        hasShadowRoot: true,
        hasRootBlock: true,
        hasSurfaceBlock: true,
        surfaceReady: true,
      });
    const replace = answer.getByTestId('answer-replace');
    await expect(replace).toBeVisible();
    await replace.click({ force: true });

    await expect
      .poll(
        async () => {
          return page.evaluate<MindmapSnapshot>(() => {
            const edgelessBlock = document.querySelector(
              'affine-edgeless-root'
            ) as EdgelessRootBlockComponent;
            const mindmaps = edgelessBlock?.gfx.gfxElements.filter(
              (el: GfxModel) => 'type' in el && el.type === 'mindmap'
            ) as unknown as Array<{
              id: string;
              tree: {
                children?: unknown[];
                element: { text?: { toString(): string } };
              };
            }>;

            const mindmap = mindmaps?.[0];
            return {
              count: mindmaps?.length ?? 0,
              id: mindmap?.id ?? null,
              childCount: mindmap?.tree.children?.length ?? 0,
            };
          });
        },
        { timeout: 15_000 }
      )
      .toMatchObject({
        count: 1,
      });

    const replacedMindmap = await page.evaluate<MindmapSnapshot>(() => {
      const edgelessBlock = document.querySelector(
        'affine-edgeless-root'
      ) as EdgelessRootBlockComponent;
      const mindmaps = edgelessBlock?.gfx.gfxElements.filter(
        (el: GfxModel) => 'type' in el && el.type === 'mindmap'
      ) as unknown as Array<{
        id: string;
        tree: {
          children?: unknown[];
          element: { text?: { toString(): string } };
        };
      }>;
      const mindmap = mindmaps?.[0];

      return {
        count: mindmaps?.length ?? 0,
        id: mindmap?.id ?? null,
        childCount: mindmap?.tree.children?.length ?? 0,
      };
    });

    expect(replacedMindmap.childCount).toBeGreaterThan(originalChildCount!);
    expect(replacedMindmap.childCount).toBeGreaterThan(0);
  });
});
