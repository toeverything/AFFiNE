import { expect, type Page } from '@playwright/test';

import {
  addNote,
  changeNoteDisplayModeWithId,
  dragBetweenViewCoords,
  edgelessCommonSetup,
  getNoteBoundBoxInEdgeless,
  getSelectedBound,
  selectNoteInEdgeless,
  zoomResetByKeyboard,
} from '../utils/actions/edgeless.js';
import { assertSelectedBound } from '../utils/asserts.js';
import { NoteDisplayMode } from '../utils/bs-alternative.js';
import { test } from '../utils/playwright.js';

test.describe('auto-connect', () => {
  async function init(page: Page) {
    await edgelessCommonSetup(page);
  }
  test('navigator', async ({ page }) => {
    await init(page);
    const id1 = await addNote(page, 'page1', 200, 300);
    const id2 = await addNote(page, 'page2', 300, 500);
    const id3 = await addNote(page, 'page3', 400, 700);

    await page.mouse.click(200, 50);
    // Notes added in edgeless mode only visible in edgeless mode
    // To use index label navigator, we need to change display mode to PageAndEdgeless
    await changeNoteDisplayModeWithId(
      page,
      id1,
      NoteDisplayMode.DocAndEdgeless
    );
    await changeNoteDisplayModeWithId(
      page,
      id2,
      NoteDisplayMode.DocAndEdgeless
    );
    await changeNoteDisplayModeWithId(
      page,
      id3,
      NoteDisplayMode.DocAndEdgeless
    );

    await selectNoteInEdgeless(page, id1);
    const bound = await getSelectedBound(page, 0);
    await page.locator('.page-visible-index-label').nth(0).click();
    await assertSelectedBound(page, bound);

    await page.locator('.edgeless-auto-connect-next-button').click();
    bound[0] += 100;
    bound[1] += 200;
    await assertSelectedBound(page, bound);

    await page.locator('.edgeless-auto-connect-next-button').click();
    bound[0] += 100;
    bound[1] += 200;
    await assertSelectedBound(page, bound);
  });

  test('should display index label when select note', async ({ page }) => {
    await init(page);
    const id1 = await addNote(page, 'page1', 200, 300);
    const id2 = await addNote(page, 'page2', 300, 500);

    await page.mouse.click(200, 50);

    await changeNoteDisplayModeWithId(
      page,
      id1,
      NoteDisplayMode.DocAndEdgeless
    );

    await selectNoteInEdgeless(page, id2);
    const edgelessOnlyIndexLabel = page.locator('.edgeless-only-index-label');
    await expect(edgelessOnlyIndexLabel).toBeVisible();
    await expect(edgelessOnlyIndexLabel).toHaveCount(1);

    await selectNoteInEdgeless(page, id1);
    const pageVisibleIndexLabel = page.locator('.page-visible-index-label');
    await expect(pageVisibleIndexLabel).toBeVisible();
    await expect(pageVisibleIndexLabel).toHaveCount(1);
  });

  test('should hide index label when dragging note', async ({ page }) => {
    await init(page);
    const id1 = await addNote(page, 'page1', 200, 300);

    await page.mouse.click(200, 50);

    await changeNoteDisplayModeWithId(
      page,
      id1,
      NoteDisplayMode.DocAndEdgeless
    );

    const pageVisibleIndexLabel = page.locator('.page-visible-index-label');
    await expect(pageVisibleIndexLabel).toBeVisible();
    await expect(pageVisibleIndexLabel).toHaveCount(1);

    const bound = await getNoteBoundBoxInEdgeless(page, id1);
    await page.mouse.move(
      bound.x + bound.width / 2,
      bound.y + bound.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      bound.x + bound.width * 2,
      bound.y + bound.height * 2
    );

    await expect(pageVisibleIndexLabel).not.toBeVisible();

    await page.mouse.up();
    await expect(pageVisibleIndexLabel).toBeVisible();
  });

  test('should update index label position after dragging', async ({
    page,
  }) => {
    await init(page);
    await zoomResetByKeyboard(page);

    const id1 = await addNote(page, 'page1', 200, 300);
    const id2 = await addNote(page, 'page2', 300, 500);

    await page.mouse.click(200, 50);

    await changeNoteDisplayModeWithId(
      page,
      id1,
      NoteDisplayMode.DocAndEdgeless
    );

    await selectNoteInEdgeless(page, id2);
    const edgelessOnlyIndexLabel = page.locator('.edgeless-only-index-label');
    await expect(edgelessOnlyIndexLabel).toBeVisible();

    // check initial index label position
    const noteBound = await getNoteBoundBoxInEdgeless(page, id2);
    const edgelessOnlyIndexLabelBound =
      await edgelessOnlyIndexLabel.boundingBox();
    if (!edgelessOnlyIndexLabelBound) {
      throw new Error('edgelessOnlyIndexLabelBound is not found');
    }
    const border = 1;
    const offset = 16;
    expect(edgelessOnlyIndexLabelBound.x).toBeCloseTo(
      noteBound.x +
        noteBound.width / 2 -
        edgelessOnlyIndexLabelBound.width / 2 +
        border
    );
    expect(edgelessOnlyIndexLabelBound.y).toBeCloseTo(
      noteBound.y + noteBound.height + offset
    );

    // move note
    await dragBetweenViewCoords(
      page,
      [noteBound.x + noteBound.width / 2, noteBound.y + noteBound.height / 2],
      [noteBound.x + noteBound.width, noteBound.y + noteBound.height]
    );

    // check new index label position
    const newNoteBound = await getNoteBoundBoxInEdgeless(page, id2);
    const newEdgelessOnlyIndexLabelBound =
      await edgelessOnlyIndexLabel.boundingBox();
    if (!newEdgelessOnlyIndexLabelBound) {
      throw new Error('newEdgelessOnlyIndexLabelBound is not found');
    }
    expect(newEdgelessOnlyIndexLabelBound.x).toBeCloseTo(
      newNoteBound.x +
        newNoteBound.width / 2 -
        newEdgelessOnlyIndexLabelBound.width / 2 +
        border
    );
    expect(newEdgelessOnlyIndexLabelBound.y).toBeCloseTo(
      newNoteBound.y + newNoteBound.height + offset
    );
  });
});
