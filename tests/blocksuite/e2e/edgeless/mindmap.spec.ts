import { expect } from '@playwright/test';

import { click, clickView } from '../utils/actions/click.js';
import { dragBetweenCoords } from '../utils/actions/drag.js';
import {
  addBasicRectShapeElement,
  autoFit,
  edgelessCommonSetup,
  getSelectedBound,
  getSelectedBoundCount,
  selectElementInEdgeless,
  waitFontsLoaded,
  zoomResetByKeyboard,
} from '../utils/actions/edgeless.js';
import {
  pressBackspace,
  pressEnter,
  pressTab,
  selectAllByKeyboard,
  type,
  undoByKeyboard,
} from '../utils/actions/keyboard.js';
import { waitNextFrame } from '../utils/actions/misc.js';
import {
  assertEdgelessSelectedRect,
  assertSelectedBound,
} from '../utils/asserts.js';
import {
  addMindmapNodes,
  createMindMap,
  getMindMapNode,
} from '../utils/mindmap.js';
import { test } from '../utils/playwright.js';

test('elements should be selectable after open mindmap menu', async ({
  page,
}) => {
  await edgelessCommonSetup(page);

  const start = { x: 100, y: 100 };
  const end = { x: 200, y: 200 };
  await addBasicRectShapeElement(page, start, end);

  await page.locator('.basket-wrapper').click({ position: { x: 0, y: 0 } });
  await expect(page.locator('edgeless-mindmap-menu')).toBeVisible();

  await page.mouse.click(start.x + 5, start.y + 5);
  await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);
});

test('undo deletion of mindmap should restore the deleted element', async ({
  page,
}) => {
  await edgelessCommonSetup(page);
  await zoomResetByKeyboard(page);

  await page.keyboard.press('m');
  await clickView(page, [0, 0]);
  await autoFit(page);

  await selectAllByKeyboard(page);
  const mindmapBound = await getSelectedBound(page);

  await pressBackspace(page);

  await selectAllByKeyboard(page);
  expect(await getSelectedBoundCount(page)).toBe(0);

  await undoByKeyboard(page);

  await selectAllByKeyboard(page);
  await assertSelectedBound(page, mindmapBound);
});

test('drag mind map node to reorder the node', async ({ page }) => {
  await edgelessCommonSetup(page);
  await zoomResetByKeyboard(page);

  const mindmapId = await createMindMap(page, [0, 0]);
  const { id: nodeId, rect: nodeRect } = await getMindMapNode(
    page,
    mindmapId,
    [0, 0]
  );
  const { rect: targetRect } = await getMindMapNode(page, mindmapId, [0, 1]);
  const { rect: lastRect } = await getMindMapNode(page, mindmapId, [0, 2]);

  await selectElementInEdgeless(page, [nodeId]);
  await dragBetweenCoords(
    page,
    { x: nodeRect.x + nodeRect.w / 2, y: nodeRect.y + nodeRect.h / 2 },
    { x: targetRect.x + targetRect.w / 2, y: targetRect.y + targetRect.h + 40 },
    {
      steps: 50,
    }
  );
  expect((await getMindMapNode(page, mindmapId, [0, 1])).id).toEqual(nodeId);

  await dragBetweenCoords(
    page,
    { x: targetRect.x + targetRect.w / 2, y: targetRect.y + targetRect.h / 2 },
    { x: nodeRect.x - 20, y: nodeRect.y - 40 },
    {
      steps: 50,
    }
  );
  expect((await getMindMapNode(page, mindmapId, [0, 0])).id).toEqual(nodeId);

  await dragBetweenCoords(
    page,
    { x: nodeRect.x + nodeRect.w / 2, y: nodeRect.y + nodeRect.h / 2 },
    { x: lastRect.x - 20, y: lastRect.y + lastRect.h + 40 },
    {
      steps: 50,
    }
  );
  expect((await getMindMapNode(page, mindmapId, [0, 2])).id).toEqual(nodeId);
});

test('drag mind map node to make it a child node', async ({ page }) => {
  await edgelessCommonSetup(page);
  await zoomResetByKeyboard(page);

  const mindmapId = await createMindMap(page, [0, 0]);

  {
    const { id: nodeId, rect: nodeRect } = await getMindMapNode(
      page,
      mindmapId,
      [0, 0]
    );
    const { rect: targetRect } = await getMindMapNode(page, mindmapId, [0, 1]);

    await selectElementInEdgeless(page, [nodeId]);
    await dragBetweenCoords(
      page,
      { x: nodeRect.x + nodeRect.w / 2, y: nodeRect.y + nodeRect.h / 2 },
      {
        x: targetRect.x + targetRect.w / 2,
        y: targetRect.y + targetRect.h / 2,
      },
      {
        steps: 50,
      }
    );
    expect((await getMindMapNode(page, mindmapId, [0, 0, 0])).id).toEqual(
      nodeId
    );
  }

  {
    const { id: childId } = await getMindMapNode(page, mindmapId, [0, 0, 0]);
    const { rect: firstRect } = await getMindMapNode(page, mindmapId, [0, 0]);
    const { rect: secondRect } = await getMindMapNode(page, mindmapId, [0, 1]);

    await dragBetweenCoords(
      page,
      { x: firstRect.x + firstRect.w / 2, y: firstRect.y + firstRect.h / 2 },
      {
        x: secondRect.x + secondRect.w + 10,
        y: secondRect.y + secondRect.h / 2,
      },
      {
        steps: 50,
      }
    );
    expect((await getMindMapNode(page, mindmapId, [0, 0, 0, 0])).id).toEqual(
      childId
    );
  }
});

test('cannot drag mind map node to itself or its descendants', async ({
  page,
}) => {
  await edgelessCommonSetup(page);
  await zoomResetByKeyboard(page);

  const mindmapId = await createMindMap(page, [0, 1]);
  await addMindmapNodes(page, mindmapId, [0, 1], {
    text: 'child node 1',
    children: [
      {
        text: 'child node 2',
      },
      {
        text: 'child node 3',
      },
    ],
  });

  const { id: node, rect } = await getMindMapNode(page, mindmapId, [0, 1]);
  const { id: childNode3, rect: childRect3 } = await getMindMapNode(
    page,
    mindmapId,
    [0, 1, 0, 1]
  );
  await dragBetweenCoords(
    page,
    { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 },
    { x: childRect3.x + childRect3.w + 10, y: childRect3.y + childRect3.h / 2 },
    {
      steps: 50,
    }
  );

  expect((await getMindMapNode(page, mindmapId, [0, 1])).id).toEqual(node);
  expect((await getMindMapNode(page, mindmapId, [0, 1, 0, 1])).id).toEqual(
    childNode3
  );
});

test('drag root node should layout in real time', async ({ page }) => {
  await edgelessCommonSetup(page);
  await zoomResetByKeyboard(page);

  // wait for the font to be loaded
  await waitFontsLoaded(page);

  const mindmapId = await createMindMap(page, [0, 0]);
  const { rect: rootRect } = await getMindMapNode(page, mindmapId, [0]);
  const { rect: firstRect } = await getMindMapNode(page, mindmapId, [0, 0]);
  const { rect: secondRect } = await getMindMapNode(page, mindmapId, [0, 1]);
  const { rect: thirdRect } = await getMindMapNode(page, mindmapId, [0, 2]);

  const assertMindMapNodesPosition = async (deltaX: number, deltaY: number) => {
    expect((await getMindMapNode(page, mindmapId, [0, 0])).rect).toEqual({
      ...firstRect,
      x: firstRect.x + deltaX,
      y: firstRect.y + deltaY,
    });
    expect((await getMindMapNode(page, mindmapId, [0, 1])).rect).toEqual({
      ...secondRect,
      x: secondRect.x + deltaX,
      y: secondRect.y + deltaY,
    });
    expect((await getMindMapNode(page, mindmapId, [0, 2])).rect).toEqual({
      ...thirdRect,
      x: thirdRect.x + deltaX,
      y: thirdRect.y + deltaY,
    });
  };

  await dragBetweenCoords(
    page,
    { x: rootRect.x + rootRect.w / 2, y: rootRect.y + rootRect.h / 2 },
    {
      x: rootRect.x + rootRect.w / 2 + 10,
      y: rootRect.y + rootRect.h / 2 + 10,
    },
    {
      steps: 50,
    }
  );

  await assertMindMapNodesPosition(10, 10);

  await page.mouse.move(
    rootRect.x + rootRect.w / 2 + 10,
    rootRect.y + rootRect.h / 2 + 10
  );
  await page.mouse.down();
  await page.mouse.move(
    rootRect.x + rootRect.w / 2 + 10 + 4,
    rootRect.y + rootRect.h / 2 + 10 + 4
  );
  await page.mouse.move(
    rootRect.x + rootRect.w / 2 + 10 + 44,
    rootRect.y + rootRect.h / 2 + 10 + 44,
    { steps: 10 }
  );

  // assert when dragging is in progress
  await waitNextFrame(page, 500);
  await assertMindMapNodesPosition(54, 54);

  await page.mouse.up();
});

test('drag node out of mind map should detach the node and create a new mind map', async ({
  page,
}) => {
  await edgelessCommonSetup(page);
  await zoomResetByKeyboard(page);

  const mindmapId = await createMindMap(page, [0, 1]);
  await addMindmapNodes(page, mindmapId, [0, 1], {
    text: 'child node 1',
    children: [
      {
        text: 'child node 2',
      },
      {
        text: 'child node 3',
      },
    ],
  });

  const { rect } = await getMindMapNode(page, mindmapId, [0, 1]);
  await click(page, { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 });
  await dragBetweenCoords(
    page,
    {
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h / 2,
    },
    {
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h / 2 + 300,
    },
    {
      steps: 50,
    }
  );

  const { count, mindmap: lastMindmapId } = await page.evaluate(() => {
    const edgelessBlock = document.querySelector('affine-edgeless-root');
    if (!edgelessBlock) {
      throw new Error('edgeless block not found');
    }
    const mindmaps = edgelessBlock.gfx.gfxElements.filter(
      el => 'type' in el && el.type === 'mindmap'
    );

    return {
      count: mindmaps.length,
      mindmap: mindmaps[mindmaps.length - 1].id,
    };
  });

  expect(count).toBe(2);
  expect((await getMindMapNode(page, lastMindmapId, [0, 0])).text).toBe(
    'child node 1'
  );
  expect((await getMindMapNode(page, lastMindmapId, [0, 0, 0])).text).toBe(
    'child node 2'
  );
  expect((await getMindMapNode(page, lastMindmapId, [0, 0, 1])).text).toBe(
    'child node 3'
  );
});

test('allow to type content directly when node has been selected', async ({
  page,
}) => {
  await edgelessCommonSetup(page);
  await zoomResetByKeyboard(page);

  const mindmapId = await createMindMap(page, [0, 0]);
  const { id: nodeId } = await getMindMapNode(page, mindmapId, [0, 1]);

  await clickView(page, [0, 0]);
  await selectElementInEdgeless(page, [nodeId]);
  await type(page, 'parent node');
  await pressEnter(page);
  await pressTab(page);
  await type(page, 'child node 1');
  await pressEnter(page);
  await pressEnter(page);
  await type(page, 'child node 2');
  await pressEnter(page);

  expect((await getMindMapNode(page, mindmapId, [0, 1])).text).toBe(
    'parent node'
  );
  expect((await getMindMapNode(page, mindmapId, [0, 1, 0])).text).toBe(
    'child node 1'
  );
  expect((await getMindMapNode(page, mindmapId, [0, 1, 1])).text).toBe(
    'child node 2'
  );
});
