import { expect } from '@playwright/test';

import {
  activeNoteInEdgeless,
  createConnectorElement,
  createNote,
  createShapeElement,
  edgelessCommonSetup,
  getConnectorPath,
  selectNoteInEdgeless,
  Shape,
  triggerComponentToolbarAction,
} from '../utils/actions/edgeless.js';
import {
  addBasicBrushElement,
  pressEnter,
  selectAllByKeyboard,
  type,
  waitNextFrame,
} from '../utils/actions/index.js';
import { assertConnectorPath } from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test.describe('note to linked doc', () => {
  test('select a note and turn it into a linked doc', async ({ page }) => {
    await edgelessCommonSetup(page);
    const noteId = await createNote(page, [100, 0], '');
    await activeNoteInEdgeless(page, noteId);
    await waitNextFrame(page, 200);
    await type(page, 'Hello');
    await pressEnter(page);
    await type(page, 'World');

    await page.mouse.click(10, 50);
    await selectNoteInEdgeless(page, noteId);
    await triggerComponentToolbarAction(page, 'turnIntoLinkedDoc');

    const embedSyncedBlock = page.locator(
      'affine-embed-edgeless-synced-doc-block'
    );
    await expect(embedSyncedBlock).toBeVisible();
    const paragraph = embedSyncedBlock.locator(
      'affine-paragraph [data-v-text="true"]'
    );
    await expect(paragraph.nth(0)).toHaveText('Hello');
    await expect(paragraph.nth(1)).toHaveText('World');
  });

  test('turn note into a linked doc, connector keeps', async ({ page }) => {
    await edgelessCommonSetup(page);
    const noteId = await createNote(page, [100, 0]);
    await createShapeElement(page, [100, 100], [100, 100], Shape.Square);
    await createConnectorElement(page, [100, 150], [100, 10]);
    const connectorPath = await getConnectorPath(page);

    await page.mouse.click(10, 50);
    await selectNoteInEdgeless(page, noteId);
    await triggerComponentToolbarAction(page, 'turnIntoLinkedDoc');

    await waitNextFrame(page, 200);
    const embedSyncedBlock = page.locator('affine-embed-synced-doc-block');
    if (!embedSyncedBlock) {
      throw new Error('embedSyncedBlock is not found');
    }

    await assertConnectorPath(page, [connectorPath[0], connectorPath[1]], 0);
  });
});

test.describe('single edgeless element to linked doc', () => {
  test('select a shape, turn into a linked doc', async ({ page }) => {
    await edgelessCommonSetup(page);
    await createShapeElement(page, [100, 100], [100, 100], Shape.Square);

    await triggerComponentToolbarAction(page, 'createLinkedDoc');
    await waitNextFrame(page, 200);
    const linkedSyncedBlock = page.locator('affine-linked-synced-doc-block');
    if (!linkedSyncedBlock) {
      throw new Error('linkedSyncedBlock is not found');
    }

    await triggerComponentToolbarAction(page, 'openLinkedDoc');
    await waitNextFrame(page, 200);

    const shapes = await page.evaluate(() => {
      const container = document.querySelector('affine-edgeless-root');
      return container!.service.crud
        .getElementsByType('shape')
        .map(s => ({ type: s.type, xywh: s.xywh }));
    });
    expect(shapes.length).toBe(1);
    expect(shapes[0]).toEqual({ type: 'shape', xywh: '[100,100,100,100]' });
  });

  test('select a connector, turn into a linked doc', async ({ page }) => {
    await edgelessCommonSetup(page);
    await createConnectorElement(page, [100, 150], [100, 10]);
    const connectorPath = await getConnectorPath(page);

    await triggerComponentToolbarAction(page, 'createLinkedDoc');
    await waitNextFrame(page, 200);
    const linkedSyncedBlock = page.locator('affine-linked-synced-doc-block');
    if (!linkedSyncedBlock) {
      throw new Error('linkedSyncedBlock is not found');
    }

    await triggerComponentToolbarAction(page, 'openLinkedDoc');
    await waitNextFrame(page, 200);
    await assertConnectorPath(page, [connectorPath[0], connectorPath[1]], 0);
  });

  test('select a brush, turn into a linked doc', async ({ page }) => {
    await edgelessCommonSetup(page);
    const start = { x: 400, y: 400 };
    const end = { x: 500, y: 500 };
    await addBasicBrushElement(page, start, end);
    await page.mouse.click(start.x + 5, start.y + 5);

    await triggerComponentToolbarAction(page, 'createLinkedDoc');
    await waitNextFrame(page, 200);
    const linkedSyncedBlock = page.locator('affine-linked-synced-doc-block');
    if (!linkedSyncedBlock) {
      throw new Error('linkedSyncedBlock is not found');
    }

    await triggerComponentToolbarAction(page, 'openLinkedDoc');
    await waitNextFrame(page, 200);
    const brushes = await page.evaluate(() => {
      const container = document.querySelector('affine-edgeless-root');
      return container!.service.crud
        .getElementsByType('brush')
        .map(s => ({ type: s.type, xywh: s.xywh }));
    });
    expect(brushes.length).toBe(1);
  });

  test('select a group, turn into a linked doc', async ({ page }) => {
    await edgelessCommonSetup(page);
    await createNote(page, [100, 0]);
    await createShapeElement(page, [100, 100], [100, 100], Shape.Square);
    await createConnectorElement(page, [100, 150], [100, 10]);
    const start = { x: 400, y: 400 };
    const end = { x: 500, y: 500 };
    await addBasicBrushElement(page, start, end);

    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');

    await triggerComponentToolbarAction(page, 'createLinkedDoc');
    await waitNextFrame(page, 200);
    const linkedSyncedBlock = page.locator('affine-linked-synced-doc-block');
    if (!linkedSyncedBlock) {
      throw new Error('linkedSyncedBlock is not found');
    }

    await triggerComponentToolbarAction(page, 'openLinkedDoc');
    await waitNextFrame(page, 200);
    const groups = await page.evaluate(() => {
      const container = document.querySelector('affine-edgeless-root');
      return container!.service.crud.getElementsByType('group').map(s => ({
        type: s.type,
        // oxlint-disable-next-line @typescript-eslint/no-explicit-any
        children: s.childElements.map((c: any) => c.type || c.flavour),
      }));
    });
    expect(groups.length).toBe(1);
    expect(groups[0].children).toContain('affine:note');
    expect(groups[0].children).toContain('shape');
    expect(groups[0].children).toContain('connector');
    expect(groups[0].children).toContain('brush');
  });

  test('select a frame, turn into a linked doc', async ({ page }) => {
    await edgelessCommonSetup(page);
    await createNote(page, [100, 0]);
    await createShapeElement(page, [100, 100], [100, 100], Shape.Square);
    await createConnectorElement(page, [100, 150], [100, 10]);

    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');

    const start = { x: 400, y: 400 };
    const end = { x: 500, y: 500 };
    await addBasicBrushElement(page, start, end);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addFrame');

    await triggerComponentToolbarAction(page, 'createLinkedDoc');
    await waitNextFrame(page, 200);
    const linkedSyncedBlock = page.locator('affine-linked-synced-doc-block');
    if (!linkedSyncedBlock) {
      throw new Error('linkedSyncedBlock is not found');
    }

    await triggerComponentToolbarAction(page, 'openLinkedDoc');
    await waitNextFrame(page, 200);
    const nodes = await page.evaluate(() => {
      const container = document.querySelector('affine-edgeless-root');
      const elements = container!.service.elements.map(s => s.type);
      const blocks = container!.service.blocks.map(b => b.flavour);

      blocks.sort();
      elements.sort();

      return { blocks, elements };
    });

    expect(nodes).toEqual({
      blocks: ['affine:note', 'affine:frame'].sort(),
      elements: ['group', 'shape', 'connector', 'brush'].sort(),
    });
  });
});

test.describe('multiple edgeless elements to linked doc', () => {
  test('multi-select note, frame, shape, connector, brush and group, turn it into a linked doc', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await createNote(page, [100, 0], 'Hello World');
    await page.mouse.click(10, 50);

    await createShapeElement(page, [100, 100], [200, 200], Shape.Square);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');

    await createShapeElement(page, [200, 200], [300, 300], Shape.Square);
    await createConnectorElement(page, [250, 300], [100, 70]);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addFrame');

    const start = { x: 400, y: 400 };
    const end = { x: 500, y: 500 };
    await addBasicBrushElement(page, start, end);

    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'createLinkedDoc');
    await waitNextFrame(page, 200);
    const linkedSyncedBlock = page.locator('affine-linked-synced-doc-block');
    if (!linkedSyncedBlock) {
      throw new Error('linkedSyncedBlock is not found');
    }

    await triggerComponentToolbarAction(page, 'openLinkedDoc');
    await waitNextFrame(page, 200);
    const nodes = await page.evaluate(() => {
      const container = document.querySelector('affine-edgeless-root');
      const elements = container!.service.elements.map(s => s.type);
      const blocks = container!.service.blocks.map(b => b.flavour);

      blocks.sort();
      elements.sort();

      return { blocks, elements };
    });
    expect(nodes).toEqual({
      blocks: ['affine:frame', 'affine:note'].sort(),
      elements: ['shape', 'shape', 'group', 'connector', 'brush'].sort(),
    });
  });

  test('multi-select with embed doc card inside, turn it into a linked doc', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const noteId = await createNote(page, [100, 0], 'Hello World');
    await page.mouse.click(10, 50);
    await selectNoteInEdgeless(page, noteId);
    await triggerComponentToolbarAction(page, 'turnIntoLinkedDoc');

    await createShapeElement(page, [100, 100], [100, 100], Shape.Square);
    await createConnectorElement(page, [100, 150], [100, 10]);

    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'createLinkedDoc');
    await waitNextFrame(page, 200);
    const linkedSyncedBlock = page.locator('affine-linked-synced-doc-block');
    if (!linkedSyncedBlock) {
      throw new Error('linkedSyncedBlock is not found');
    }

    await triggerComponentToolbarAction(page, 'openLinkedDoc');
    await waitNextFrame(page, 200);
    const nodes = await page.evaluate(() => {
      const container = document.querySelector('affine-edgeless-root');
      const elements = container!.service.elements.map(s => s.type);
      const blocks = container!.service.blocks.map(b => b.flavour);
      return { blocks, elements };
    });

    expect(nodes.blocks).toHaveLength(1);
    expect(nodes.blocks).toContain('affine:embed-synced-doc');

    expect(nodes.elements).toHaveLength(2);
    expect(nodes.elements).toContain('shape');
    expect(nodes.elements).toContain('connector');
  });

  test('multi-select with mindmap, turn it into a linked doc', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await triggerComponentToolbarAction(page, 'addMindmap');

    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'createLinkedDoc');
    await waitNextFrame(page, 200);
    const linkedSyncedBlock = page.locator('affine-linked-synced-doc-block');
    if (!linkedSyncedBlock) {
      throw new Error('linkedSyncedBlock is not found');
    }

    await triggerComponentToolbarAction(page, 'openLinkedDoc');
    await waitNextFrame(page, 200);
    const nodes = await page.evaluate(() => {
      const container = document.querySelector('affine-edgeless-root');
      const elements = container!.service.elements.map(s => s.type);
      const blocks = container!.service.blocks.map(b => b.flavour);
      return { blocks, elements };
    });

    expect(nodes.blocks).toHaveLength(0);

    expect(nodes.elements).toHaveLength(5);
    expect(nodes.elements).toContain('mindmap');
    expect(nodes.elements.filter(el => el === 'shape')).toHaveLength(4);
  });
});
