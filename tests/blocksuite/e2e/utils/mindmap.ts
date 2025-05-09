import type {
  MindmapElementModel,
  MindmapNode,
  ShapeElementModel,
} from '@blocksuite/affine/model';
import type { Page } from '@playwright/test';

import { clickView } from './actions/click.js';

export async function createMindMap(page: Page, coords: [number, number]) {
  await page.keyboard.press('m');
  await clickView(page, coords);

  const id = await page.evaluate(() => {
    const edgelessBlock = document.querySelector('affine-edgeless-root');
    if (!edgelessBlock) {
      throw new Error('edgeless block not found');
    }
    const mindmaps = edgelessBlock.gfx.gfxElements.filter(
      el => 'type' in el && el.type === 'mindmap'
    );

    return mindmaps[mindmaps.length - 1].id;
  });

  return id;
}

export async function getMindMapNode(
  page: Page,
  mindmapId: string,
  pathOrId: number[] | string
) {
  return page.evaluate(
    ({ mindmapId, pathOrId }) => {
      const edgelessBlock = document.querySelector('affine-edgeless-root');
      if (!edgelessBlock) {
        throw new Error('edgeless block not found');
      }

      const mindmap = edgelessBlock.gfx.getElementById(
        mindmapId
      ) as MindmapElementModel;
      if (!mindmap) {
        throw new Error(`Mindmap not found: ${mindmapId}`);
      }

      const node = Array.isArray(pathOrId)
        ? mindmap.getNodeByPath(pathOrId)
        : mindmap.getNode(pathOrId);
      if (!node) {
        throw new Error(`Mindmap node not found at: ${pathOrId}`);
      }

      const rect = edgelessBlock.gfx.viewport.toViewBound(
        node.element.elementBound
      );

      return {
        path: mindmap.getPath(node),
        id: node.id,
        text: (node.element as ShapeElementModel).text?.toString() ?? '',
        rect: {
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.h,
        },
      };
    },
    {
      mindmapId,
      pathOrId,
    }
  );
}

type NewNodeInfo = {
  text: string;
  children?: NewNodeInfo[];
};

export async function addMindmapNodes(
  page: Page,
  mindmapId: string,
  path: number[],
  newNode: NewNodeInfo
) {
  return page.evaluate(
    ({ mindmapId, path, newNode }) => {
      const edgelessBlock = document.querySelector('affine-edgeless-root');
      if (!edgelessBlock) {
        throw new Error('edgeless block not found');
      }

      const mindmap = edgelessBlock.gfx.getElementById(
        mindmapId
      ) as MindmapElementModel;
      if (!mindmap) {
        throw new Error(`Mindmap not found: ${mindmapId}`);
      }

      const parent = mindmap.getNodeByPath(path);
      if (!parent) {
        throw new Error(`Mindmap node not found at: ${path}`);
      }

      const addNode = (
        mindmap: MindmapElementModel,
        node: NewNodeInfo,
        parent: MindmapNode
      ) => {
        const newNodeId = mindmap.addNode(parent, undefined, undefined, {
          text: node.text,
        });

        if (node.children) {
          node.children.forEach(child => {
            addNode(mindmap, child, mindmap.getNode(newNodeId)!);
          });
        }

        return newNodeId;
      };

      return addNode(mindmap, newNode, parent);
    },
    { mindmapId, path, newNode }
  );
}
