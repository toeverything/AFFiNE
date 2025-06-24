import { expect, type Page } from '@playwright/test';
import { lightThemeV2 } from '@toeverything/theme/v2';

import { clickView, moveView } from '../utils/actions/click.js';
import { dragBetweenCoords } from '../utils/actions/drag.js';
import {
  addNote,
  changeEdgelessNoteBackground,
  changeShapeFillColor,
  changeShapeStrokeColor,
  createShapeElement,
  deleteAll,
  dragBetweenViewCoords,
  edgelessCommonSetup,
  getEdgelessSelectedRectModel,
  Shape,
  switchEditorMode,
  toViewCoord,
  triggerComponentToolbarAction,
} from '../utils/actions/edgeless.js';
import {
  enterPlaygroundRoom,
  initEmptyEdgelessState,
  waitForInlineEditorStateUpdated,
  waitNextFrame,
} from '../utils/actions/misc.js';
import {
  assertConnectorStrokeColor,
  assertEdgelessCanvasText,
  assertEdgelessNoteBackground,
  assertRichTexts,
  assertSelectedBound,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

function getAutoCompletePanelButton(page: Page, type: string) {
  return page
    .locator('.auto-complete-panel-container')
    .locator('edgeless-tool-icon-button')
    .filter({ hasText: `${type}` });
}

test.describe('auto-complete', () => {
  test.describe('click on auto-complete button', () => {
    test('click on right auto-complete button', async ({ page }) => {
      await edgelessCommonSetup(page);
      await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
      await assertSelectedBound(page, [0, 0, 100, 100]);
      await clickView(page, [120, 50]);
      await assertSelectedBound(page, [200, 0, 100, 100]);
    });
    test('click on bottom auto-complete button', async ({ page }) => {
      await edgelessCommonSetup(page);
      await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
      await assertSelectedBound(page, [0, 0, 100, 100]);
      await clickView(page, [50, 120]);
      await assertSelectedBound(page, [0, 200, 100, 100]);
    });
    test('click on left auto-complete button', async ({ page }) => {
      await edgelessCommonSetup(page);
      await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
      await assertSelectedBound(page, [0, 0, 100, 100]);
      await clickView(page, [-20, 50]);
      await assertSelectedBound(page, [-200, 0, 100, 100]);
    });
    test('click on top auto-complete button', async ({ page }) => {
      await edgelessCommonSetup(page);
      await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
      await assertSelectedBound(page, [0, 0, 100, 100]);
      await clickView(page, [50, -20]);
      await assertSelectedBound(page, [0, -200, 100, 100]);
    });

    test('click on note auto-complete button', async ({ page }) => {
      await edgelessCommonSetup(page);
      await addNote(page, 'note', 100, 100);
      await page.mouse.click(600, 50);
      await page.mouse.click(300, 50);
      await page.mouse.click(150, 120);
      const rect = await getEdgelessSelectedRectModel(page);
      await moveView(page, [rect[0] + rect[2] + 30, rect[1] + rect[3] / 2]);
      await clickView(page, [rect[0] + rect[2] + 30, rect[1] + rect[3] / 2]);
      const newRect = await getEdgelessSelectedRectModel(page);
      expect(rect[0]).not.toEqual(newRect[0]);
      expect(rect[1]).toEqual(newRect[1]);
      expect(rect[2]).toEqual(newRect[2]);
      expect(rect[3]).toEqual(newRect[3]);
    });
  });

  test.describe('drag on auto-complete button', () => {
    test('drag on right auto-complete button to add shape', async ({
      page,
    }) => {
      await edgelessCommonSetup(page);
      await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
      await assertSelectedBound(page, [0, 0, 100, 100]);
      await dragBetweenViewCoords(page, [120, 50], [200, 0]);

      const ellipseButton = getAutoCompletePanelButton(page, 'ellipse');
      await expect(ellipseButton).toBeVisible();
      await ellipseButton.click();

      await assertSelectedBound(page, [200, -50, 100, 100]);
    });

    test('drag on right auto-complete button to add canvas text', async ({
      page,
    }) => {
      await enterPlaygroundRoom(page);
      await page.evaluate(() => {
        window.doc
          .get(window.$blocksuite.services.FeatureFlagService)
          .setFlag('enable_edgeless_text', false);
      });
      await initEmptyEdgelessState(page);
      await switchEditorMode(page);
      await deleteAll(page);
      await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
      await assertSelectedBound(page, [0, 0, 100, 100]);
      await dragBetweenViewCoords(page, [120, 50], [200, 0]);

      const canvasTextButton = getAutoCompletePanelButton(page, 'text');
      await expect(canvasTextButton).toBeVisible();
      await canvasTextButton.click();

      await waitForInlineEditorStateUpdated(page);
      await waitNextFrame(page);
      await page.keyboard.type('hello');
      await assertEdgelessCanvasText(page, 'hello');
    });

    test('drag on right auto-complete button to add note', async ({ page }) => {
      await edgelessCommonSetup(page);
      await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
      await assertSelectedBound(page, [0, 0, 100, 100]);
      await triggerComponentToolbarAction(page, 'changeShapeColor');
      await changeShapeStrokeColor(page, 'MediumRed');
      await changeShapeFillColor(page, 'HeavyGreen');
      // Closes color pickers
      await triggerComponentToolbarAction(page, 'changeShapeColor');

      await dragBetweenViewCoords(page, [120, 50], [200, 0]);

      const noteButton = getAutoCompletePanelButton(page, 'note');
      await expect(noteButton).toBeVisible();
      await noteButton.click();
      await waitNextFrame(page);

      const edgelessNote = page.locator('affine-edgeless-note');

      expect(await edgelessNote.count()).toBe(1);
      const [x, y] = await toViewCoord(page, [240, 20]);
      await page.mouse.click(x, y);
      await page.keyboard.type('hello');
      await waitNextFrame(page);
      await assertRichTexts(page, ['hello']);

      const noteId = await page.evaluate(() => {
        const note = document.body.querySelector('affine-edgeless-note');
        return note?.getAttribute('data-block-id');
      });
      if (!noteId) {
        throw new Error('noteId is not found');
      }
      await assertEdgelessNoteBackground(
        page,
        noteId,
        lightThemeV2['edgeless/note/white']
      );

      const rect = await edgelessNote.boundingBox();
      if (!rect) {
        throw new Error('rect is not found');
      }

      // blur note block
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height * 3);
      await waitNextFrame(page);

      // select connector
      await dragBetweenViewCoords(page, [140, 50], [160, 0]);
      await waitNextFrame(page);
      await assertConnectorStrokeColor(
        page,
        'MediumRed',
        lightThemeV2['edgeless/palette/medium/redMedium']
      );

      // select note block
      await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await waitNextFrame(page);

      await triggerComponentToolbarAction(page, 'changeNoteStyle');
      await changeEdgelessNoteBackground(page, 'Red');

      // move to arrow icon
      await page.mouse.move(
        rect.x + rect.width + 20,
        rect.y + rect.height / 2,
        { steps: 5 }
      );
      await waitNextFrame(page);

      // drag arrow
      await dragBetweenCoords(
        page,
        {
          x: rect.x + rect.width + 20,
          y: rect.y + rect.height / 2,
        },
        {
          x: rect.x + rect.width + 20 + 50,
          y: rect.y + rect.height / 2 + 50,
        }
      );

      // `Add a same object` button has the same type.
      const noteButton2 = getAutoCompletePanelButton(page, 'note').nth(0);
      await expect(noteButton2).toBeVisible();
      await noteButton2.click();
      await waitNextFrame(page);

      const noteId2 = await page.evaluate(() => {
        const note = document.body.querySelectorAll('affine-edgeless-note')[1];
        return note?.getAttribute('data-block-id');
      });
      if (!noteId2) {
        throw new Error('noteId2 is not found');
      }
      await assertEdgelessNoteBackground(
        page,
        noteId,
        lightThemeV2['edgeless/note/red']
      );

      expect(await edgelessNote.count()).toBe(2);
    });

    test('drag on right auto-complete button to add frame', async ({
      page,
    }) => {
      await edgelessCommonSetup(page);
      await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
      await assertSelectedBound(page, [0, 0, 100, 100]);
      await dragBetweenViewCoords(page, [120, 50], [200, 0]);

      expect(await page.locator('.affine-frame-container').count()).toBe(0);

      const frameButton = getAutoCompletePanelButton(page, 'frame');
      await expect(frameButton).toBeVisible();
      await frameButton.click();

      expect(await page.locator('.affine-frame-container').count()).toBe(1);
    });
  });
});
