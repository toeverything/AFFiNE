import { expect, type Page } from '@playwright/test';

import {
  addNote,
  locatorScalePanelButton,
  selectNoteInEdgeless,
  switchEditorMode,
  triggerComponentToolbarAction,
  zoomResetByKeyboard,
} from '../../utils/actions/edgeless.js';
import {
  copyByKeyboard,
  pasteByKeyboard,
  selectAllByKeyboard,
} from '../../utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  initEmptyEdgelessState,
  waitNextFrame,
} from '../../utils/actions/misc.js';
import { assertRectExist } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

async function setupAndAddNote(page: Page) {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  const noteId = await addNote(page, 'hello world', 100, 200);
  await page.mouse.click(0, 0);
  return noteId;
}

async function openScalePanel(page: Page, noteId: string) {
  await selectNoteInEdgeless(page, noteId);
  await triggerComponentToolbarAction(page, 'changeNoteScale');
  await waitNextFrame(page);
  const scalePanel = page.locator('.scale-menu');
  await expect(scalePanel).toBeVisible();
  return scalePanel;
}

async function checkNoteScale(
  page: Page,
  noteId: string,
  expectedScale: number,
  expectedType: 'equal' | 'greater' | 'less' = 'equal'
) {
  const edgelessNote = page.locator(
    `affine-edgeless-note[data-block-id="${noteId}"]`
  );
  const noteContainer = edgelessNote.getByTestId('edgeless-note-container');
  const style = await noteContainer.getAttribute('style');

  if (!style) {
    throw new Error('Style attribute not found');
  }

  const scaleMatch = style.match(/transform:\s*scale\(([\d.]+)\)/);
  if (!scaleMatch) {
    throw new Error('Scale transform not found in style');
  }

  const actualScale = parseFloat(scaleMatch[1]);

  switch (expectedType) {
    case 'equal':
      expect(actualScale).toBeCloseTo(expectedScale, 2);
      break;
    case 'greater':
      expect(actualScale).toBeGreaterThan(expectedScale);
      break;
    case 'less':
      expect(actualScale).toBeLessThan(expectedScale);
  }
}

test.describe('note scale', () => {
  test('Note scale can be changed by scale panel button', async ({ page }) => {
    const noteId = await setupAndAddNote(page);
    await openScalePanel(page, noteId);

    const scale150 = locatorScalePanelButton(page, 50);
    await scale150.click();

    await checkNoteScale(page, noteId, 0.5);
  });

  test('Note scale can be changed by scale panel input', async ({ page }) => {
    const noteId = await setupAndAddNote(page);
    const scalePanel = await openScalePanel(page, noteId);

    const scaleInput = scalePanel.locator('input');
    await scaleInput.click();
    await page.keyboard.type('50');
    await page.keyboard.press('Enter');

    await checkNoteScale(page, noteId, 0.5);
  });

  test('Note scale input support copy paste', async ({ page }) => {
    const noteId = await setupAndAddNote(page);
    const scalePanel = await openScalePanel(page, noteId);

    const scaleInput = scalePanel.locator('input');
    await scaleInput.click();
    await page.keyboard.type('50');
    await selectAllByKeyboard(page);
    await copyByKeyboard(page);
    await page.mouse.click(0, 0);

    await selectNoteInEdgeless(page, noteId);
    await triggerComponentToolbarAction(page, 'changeNoteScale');
    await waitNextFrame(page);

    await scaleInput.click();
    await pasteByKeyboard(page);
    await page.keyboard.press('Enter');

    await checkNoteScale(page, noteId, 0.5);
  });

  test('Note scale can be changed by shift drag', async ({ page }) => {
    const noteId = await setupAndAddNote(page);
    await selectNoteInEdgeless(page, noteId);

    const edgelessNote = page.locator(
      `affine-edgeless-note[data-block-id="${noteId}"]`
    );
    const noteRect = await edgelessNote.boundingBox();
    assertRectExist(noteRect);
    await page.mouse.move(
      noteRect.x + noteRect.width,
      noteRect.y + noteRect.height
    );
    await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(
      noteRect.x + noteRect.width * 2,
      noteRect.y + noteRect.height * 2,
      {
        steps: 10,
      }
    );
    await page.mouse.up();

    // expect style scale to be greater than 1
    await checkNoteScale(page, noteId, 1, 'greater');
  });
});
