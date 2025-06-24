import { expect, type Page } from '@playwright/test';

import { clickView, dblclickView, moveView } from '../utils/actions/click.js';
import {
  createBrushElement,
  createConnectorElement,
  createEdgelessText,
  createFrame,
  createMindmap,
  createNote as _createNote,
  createShapeElement,
  deleteAll,
  dragBetweenViewCoords,
  edgelessCommonSetup,
  getContainerChildIds,
  getSelectedBound,
  getSelectedIds,
  getTypeById,
  setEdgelessTool,
} from '../utils/actions/edgeless.js';
import {
  copyByKeyboard,
  pasteByKeyboard,
  pressArrowDown,
  pressBackspace,
  pressEscape,
  pressForwardDelete,
  pressTab,
  selectAllByKeyboard,
  SHORT_KEY,
  type,
  undoByKeyboard,
} from '../utils/actions/keyboard.js';
import { waitNextFrame } from '../utils/actions/misc.js';
import {
  assertCanvasElementsCount,
  assertEdgelessElementBound,
  assertEdgelessSelectedModelRect,
  assertRichTexts,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test.describe('lock', () => {
  const getButtons = (page: Page) => {
    const toolbar = page.locator('affine-toolbar-widget');
    return {
      lock: toolbar.getByTestId('lock'),
      unlock: toolbar.getByTestId('unlock'),
    };
  };

  async function createNote(page: Page, coord1: number[], content?: string) {
    await _createNote(page, coord1, content);
    await pressEscape(page, 3);
  }

  test('edgeless element can be locked and unlocked', async ({ page }) => {
    await edgelessCommonSetup(page);

    const wrapTest = async <F extends (...args: any) => any>(
      elementCreateFn: F,
      ...args: Parameters<F>
    ) => {
      await elementCreateFn(...args);
      await waitNextFrame(page);
      await pressEscape(page);
      await selectAllByKeyboard(page);

      const ids = await getSelectedIds(page);
      expect(ids).toHaveLength(1);
      const type = await getTypeById(page, ids[0]);
      const message = `element(${type}) should be able to be (un)locked`;

      const { lock, unlock } = getButtons(page);

      await expect(lock, message).toBeVisible();
      await expect(unlock, message).toBeHidden();

      await lock.click();
      await expect(lock, message).toBeHidden();
      await expect(unlock, message).toBeVisible();

      await unlock.click();
      await expect(lock, message).toBeVisible();
      await expect(unlock, message).toBeHidden();
      await deleteAll(page);
      await waitNextFrame(page);
    };

    await wrapTest(createBrushElement, page, [100, 100], [150, 150]);
    await wrapTest(createConnectorElement, page, [100, 100], [150, 150]);
    await wrapTest(createShapeElement, page, [100, 100], [150, 150]);
    await wrapTest(createEdgelessText, page, [100, 100]);
    await wrapTest(createMindmap, page, [100, 100]);
    await wrapTest(createFrame, page, [100, 100], [150, 150]);
    await wrapTest(createNote, page, [100, 100]);

    await wrapTest(async () => {
      await createShapeElement(page, [100, 100], [150, 150]);
      await createShapeElement(page, [150, 150], [200, 200]);
      await selectAllByKeyboard(page);
      await page.keyboard.press(`${SHORT_KEY}+g`);
    });
  });

  test('locked element should be selectable by clicking or short-cut', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await createShapeElement(page, [100, 100], [150, 150]);
    await selectAllByKeyboard(page);

    await getButtons(page).lock.click();
    expect(await getSelectedIds(page)).toHaveLength(1);
    await pressEscape(page);
    expect(await getSelectedIds(page)).toHaveLength(0);
    await selectAllByKeyboard(page);
    expect(await getSelectedIds(page)).toHaveLength(1);

    await pressEscape(page);
    await clickView(page, [125, 125]);
    expect(await getSelectedIds(page)).toHaveLength(1);
  });

  test('locked element should not be selectable by dragging default tool. unlocking will recover', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await createShapeElement(page, [100, 100], [150, 150]);
    await selectAllByKeyboard(page);

    const { lock, unlock } = getButtons(page);

    await lock.click();
    await pressEscape(page);
    await dragBetweenViewCoords(page, [90, 90], [160, 160]);
    expect(await getSelectedIds(page)).toHaveLength(0);

    await clickView(page, [125, 125]);
    await unlock.click();
    await dragBetweenViewCoords(page, [90, 90], [160, 160]);
    expect(await getSelectedIds(page)).toHaveLength(1);
  });

  test('descendant of locked element should not be selectable. unlocking will recover', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const shapeId = await createShapeElement(page, [100, 100], [150, 150]);
    await createShapeElement(page, [150, 150], [200, 200]);
    await selectAllByKeyboard(page);
    await page.keyboard.press(`${SHORT_KEY}+g`);
    const groupId = (await getSelectedIds(page))[0];

    const { lock, unlock } = getButtons(page);

    await lock.click();
    await pressEscape(page);
    await clickView(page, [125, 125]);
    expect(await getSelectedIds(page)).toEqual([groupId]);
    await clickView(page, [125, 125]);
    expect(await getSelectedIds(page)).toEqual([groupId]);

    await unlock.click();
    await clickView(page, [125, 125]);
    expect(await getSelectedIds(page)).toEqual([shapeId]);
    await pressEscape(page);

    const frameId = await createFrame(page, [50, 50], [250, 250]);
    await selectAllByKeyboard(page);
    await lock.click();
    await pressEscape(page);
    await clickView(page, [125, 125]);
    expect(await getSelectedIds(page)).toEqual([frameId]);
    await unlock.click();
    await clickView(page, [125, 125]);
    expect(await getSelectedIds(page)).toEqual([shapeId]);
  });

  test('the selected rect of locked element should contain descendant. unlocking will recover', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    // frame
    await createFrame(page, [0, 0], [100, 100]);
    await createShapeElement(page, [100, 100], [150, 150]);
    await dragBetweenViewCoords(page, [125, 125], [95, 95]); // add shape to frame, and partial area out of frame
    await selectAllByKeyboard(page);

    await assertEdgelessSelectedModelRect(page, [0, 0, 100, 100]); // only frame outline

    const { lock, unlock } = getButtons(page);

    await lock.click();
    await assertEdgelessSelectedModelRect(page, [0, 0, 125, 125]); // frame outline and shape
    await pressEscape(page);
    await clickView(page, [90, 90]);
    await assertEdgelessSelectedModelRect(page, [0, 0, 125, 125]);

    await unlock.click();
    await assertEdgelessSelectedModelRect(page, [0, 0, 100, 100]);
    await pressEscape(page);
    await clickView(page, [100, 100]);
    await assertEdgelessSelectedModelRect(page, [75, 75, 50, 50]);

    await deleteAll(page);

    // mindmap
    await createMindmap(page, [100, 100]);
    const bound = await getSelectedBound(page);
    const rootNodePos: [number, number] = [
      bound[0] + 10,
      bound[1] + 0.5 * bound[3],
    ];

    await clickView(page, rootNodePos);
    const rootNodeBound = await getSelectedBound(page);

    await lock.click();
    await assertEdgelessSelectedModelRect(page, bound);
    await clickView(page, rootNodePos);
    await assertEdgelessSelectedModelRect(page, bound);

    await unlock.click();
    await assertEdgelessSelectedModelRect(page, bound);
    await clickView(page, rootNodePos);
    await assertEdgelessSelectedModelRect(page, rootNodeBound);
  });

  test('locked element should be copyable, and the copy is unlocked', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await createShapeElement(page, [100, 100], [150, 150]);
    await selectAllByKeyboard(page);

    await getButtons(page).lock.click();
    await pressEscape(page);
    await clickView(page, [125, 125]);
    await copyByKeyboard(page);
    await moveView(page, [200, 200]);
    await pasteByKeyboard(page);
    await clickView(page, [200, 200]);
    await expect(getButtons(page).lock).toBeVisible();
  });

  test('locked element and descendant should not be draggable and moved by arrow key. unlocking will recover', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const frame = await createFrame(page, [50, 50], [250, 250]);
    const shape1 = await createShapeElement(page, [100, 100], [150, 150]);
    const shape2 = await createShapeElement(page, [150, 150], [200, 200]);
    await selectAllByKeyboard(page);

    await getButtons(page).lock.click();
    await pressEscape(page);

    await dragBetweenViewCoords(page, [100, 100], [150, 150]);
    await assertEdgelessElementBound(page, frame, [50, 50, 200, 200]);
    await assertEdgelessElementBound(page, shape1, [100, 100, 50, 50]);
    await assertEdgelessElementBound(page, shape2, [150, 150, 50, 50]);

    await pressArrowDown(page, 3);
    await assertEdgelessElementBound(page, frame, [50, 50, 200, 200]);
    await assertEdgelessElementBound(page, shape1, [100, 100, 50, 50]);
    await assertEdgelessElementBound(page, shape2, [150, 150, 50, 50]);

    await getButtons(page).unlock.click();
    await dragBetweenViewCoords(page, [100, 100], [150, 150]);
    await assertEdgelessElementBound(page, frame, [100, 100, 200, 200]);
    await assertEdgelessElementBound(page, shape1, [150, 150, 50, 50]);
    await assertEdgelessElementBound(page, shape2, [200, 200, 50, 50]);

    await pressArrowDown(page, 3);
    await assertEdgelessElementBound(page, frame, [100, 103, 200, 200]);
    await assertEdgelessElementBound(page, shape1, [150, 153, 50, 50]);
    await assertEdgelessElementBound(page, shape2, [200, 203, 50, 50]);
  });

  test('locked element should be moved if parent is moved', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const frame = await createFrame(page, [50, 50], [250, 250]);
    const shape = await createShapeElement(page, [100, 100], [150, 150]);
    await clickView(page, [125, 125]);
    await getButtons(page).lock.click();

    await selectAllByKeyboard(page);
    await dragBetweenViewCoords(page, [100, 100], [150, 150]);

    await assertEdgelessElementBound(page, frame, [100, 100, 200, 200]);
    await assertEdgelessElementBound(page, shape, [150, 150, 50, 50]);
  });

  test('locked element should not be scalable and rotatable. unlocking will recover', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await createShapeElement(page, [100, 100], [150, 150]);
    await selectAllByKeyboard(page);

    const rect = page.locator('edgeless-selected-rect');
    const { lock, unlock } = getButtons(page);
    await expect(rect.locator('.resize')).toHaveCount(8);
    await expect(rect.locator('.rotate')).toHaveCount(4);

    await lock.click();
    await expect(rect.locator('.resize')).toHaveCount(0);
    await expect(rect.locator('.rotate')).toHaveCount(0);

    await unlock.click();
    await expect(rect.locator('.resize')).toHaveCount(8);
    await expect(rect.locator('.rotate')).toHaveCount(4);
  });

  test('locked element should not be editable. unlocking will recover', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const { lock, unlock } = getButtons(page);

    // Shape
    {
      await createShapeElement(page, [100, 100], [150, 150]);
      await selectAllByKeyboard(page);
      await lock.click();
      await dblclickView(page, [125, 125]);
      await expect(page.locator('edgeless-shape-text-editor')).toHaveCount(0);
      await unlock.click();
      await dblclickView(page, [125, 125]);
      await expect(page.locator('edgeless-shape-text-editor')).toHaveCount(1);
      await deleteAll(page);
    }

    // Connector
    {
      await createConnectorElement(page, [100, 100], [150, 150]);
      await selectAllByKeyboard(page);
      await lock.click();
      await dblclickView(page, [125, 125]);
      await expect(page.locator('edgeless-connector-label-editor')).toHaveCount(
        0
      );
      await unlock.click();
      await dblclickView(page, [125, 125]);
      await expect(page.locator('edgeless-connector-label-editor')).toHaveCount(
        1
      );
      await deleteAll(page);
    }

    // Mindmap
    {
      await createMindmap(page, [100, 100]);
      const bound = await getSelectedBound(page);
      const rootPos: [number, number] = [
        bound[0] + 10,
        bound[1] + 0.5 * bound[3],
      ];
      await lock.click();
      await dblclickView(page, rootPos);
      await expect(page.locator('edgeless-shape-text-editor')).toHaveCount(0);
      await unlock.click();
      await dblclickView(page, rootPos);
      await expect(page.locator('edgeless-shape-text-editor')).toHaveCount(1);
      await deleteAll(page);
    }

    // Edgeless Text
    {
      await createEdgelessText(page, [100, 100], 'text');
      await selectAllByKeyboard(page);
      await lock.click();
      const text = page.locator('affine-edgeless-text');
      await text.dblclick();
      await type(page, '111');
      await expect(text).toHaveText('text');
      await unlock.click();
      await text.dblclick();
      await type(page, '111');
      await expect(text).toHaveText('111');
      await deleteAll(page);
    }

    // Note
    {
      await createNote(page, [100, 100], 'note');
      await selectAllByKeyboard(page);
      await lock.click();
      const note = page.locator('affine-edgeless-note');
      await note.dblclick();
      await page.keyboard.press('End');
      await type(page, '111');
      await assertRichTexts(page, ['note']);
      await unlock.click();
      await note.dblclick();
      await page.keyboard.press('End');
      await type(page, '111');
      await assertRichTexts(page, ['note111']);
      await pressEscape(page, 3);
      await deleteAll(page);
    }
  });

  test('locked element should not be deletable. unlocking will recover', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await createShapeElement(page, [100, 100], [150, 150]);
    await selectAllByKeyboard(page);
    const { lock, unlock } = getButtons(page);

    await lock.click();
    await clickView(page, [125, 125]);
    await pressBackspace(page);
    await assertCanvasElementsCount(page, 1);
    await page.keyboard.press('Delete');
    await assertCanvasElementsCount(page, 1);
    await pressForwardDelete(page);
    await assertCanvasElementsCount(page, 1);
    await setEdgelessTool(page, 'eraser');
    await dragBetweenViewCoords(page, [90, 90], [160, 160], { steps: 2 });
    await assertCanvasElementsCount(page, 1);
    await setEdgelessTool(page, 'default');

    await selectAllByKeyboard(page);
    await unlock.click();
    await page.evaluate(() => {
      window.doc.captureSync();
    });
    await pressBackspace(page);
    await assertCanvasElementsCount(page, 0);
    await undoByKeyboard(page);
    await assertCanvasElementsCount(page, 1);
    await page.keyboard.press('Delete');
    await assertCanvasElementsCount(page, 0);
    await undoByKeyboard(page);
    await assertCanvasElementsCount(page, 1);
    await pressForwardDelete(page);
    await assertCanvasElementsCount(page, 0);
    await undoByKeyboard(page);
    await assertCanvasElementsCount(page, 1);
    await setEdgelessTool(page, 'eraser');
    await dragBetweenViewCoords(page, [90, 90], [160, 160], { steps: 2 });
    await assertCanvasElementsCount(page, 0);
  });

  test('locked frame should not add new child element. unlocking will recover', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const frame = await createFrame(page, [50, 50], [250, 250]);
    await selectAllByKeyboard(page);
    const frameTitle = page.locator('affine-frame-title');
    const { lock, unlock } = getButtons(page);

    await lock.click();
    const shape = await createShapeElement(page, [100, 100], [150, 150]);

    expect(await getContainerChildIds(page, frame)).toHaveLength(0);

    await frameTitle.click();
    await unlock.click();
    expect(await getContainerChildIds(page, frame)).toHaveLength(0);
    await clickView(page, [125, 125]);
    await dragBetweenViewCoords(page, [125, 125], [130, 130]); // move shape into frame
    expect(await getContainerChildIds(page, frame)).toEqual([shape]);
  });

  test('locked mindmap can not create new node by pressing Tab. unlocking will recover', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await createMindmap(page, [100, 100]);
    await selectAllByKeyboard(page);
    const bound = await getSelectedBound(page);
    const rootPos: [number, number] = [
      bound[0] + 10,
      bound[1] + 0.5 * bound[3],
    ];
    const nodeEditor = page.locator('edgeless-shape-text-editor');
    const { lock, unlock } = getButtons(page);
    await lock.click();
    await clickView(page, rootPos);
    await pressTab(page);
    await expect(nodeEditor).toHaveCount(0);
    await unlock.click();
    await clickView(page, rootPos);
    await pressTab(page);
    await expect(nodeEditor).toHaveCount(1);
    await expect(nodeEditor).toHaveText('New node');
  });

  test('endpoint of locked connector should not be changeable. unlocking will recover', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await createConnectorElement(page, [100, 100], [150, 150]);
    const handles = page.locator('edgeless-connector-handle');
    await expect(handles).toHaveCount(1);
    const { lock, unlock } = getButtons(page);
    await lock.click();
    await expect(handles).toHaveCount(0);
    await unlock.click();
    await expect(handles).toHaveCount(1);
  });

  test('locking multiple elements will create locked group. unlocking a group will release elements', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    const shape1 = await createShapeElement(page, [100, 100], [150, 150]);
    const shape2 = await createShapeElement(page, [150, 150], [200, 200]);
    await selectAllByKeyboard(page);
    const { lock, unlock } = getButtons(page);
    await lock.click();
    const group = (await getSelectedIds(page))[0];
    expect(group).not.toBeUndefined();
    expect(await getTypeById(page, group)).toBe('group');

    await unlock.click();
    expect(await getSelectedIds(page)).toEqual([shape1, shape2]);
  });

  test('locking a group should not create a new group', async ({ page }) => {
    await edgelessCommonSetup(page);
    await createShapeElement(page, [100, 100], [150, 150]);
    await createShapeElement(page, [150, 150], [200, 200]);
    await selectAllByKeyboard(page);
    await page.keyboard.press(`${SHORT_KEY}+g`);
    const group = (await getSelectedIds(page))[0];
    await getButtons(page).lock.click();
    expect(await getSelectedIds(page)).toEqual([group]);
  });

  test('unlocking an element should not unlock its locked descendant', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await createFrame(page, [50, 50], [250, 250]);
    await createShapeElement(page, [150, 150], [200, 200]);

    const { lock, unlock } = getButtons(page);

    await clickView(page, [175, 175]);
    await lock.click();
    await page.locator('affine-frame-title').click();
    await lock.click();
    await unlock.click();
    await clickView(page, [175, 175]);
    await expect(lock).toBeHidden();
    await expect(unlock).toBeVisible();
  });
});
