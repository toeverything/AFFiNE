import { expect } from '@playwright/test';

import {
  enterPlaygroundRoom,
  initEmptyEdgelessState,
  initSixParagraphs,
  initThreeParagraphs,
  selectNoteInEdgeless,
  switchEditorMode,
  triggerComponentToolbarAction,
} from '../../utils/actions/index.js';
import { assertRectExist, assertRichTexts } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

test.describe('note slicer', () => {
  test('could enable and disenable note slicer', async ({ page }) => {
    await enterPlaygroundRoom(page);
    const { noteId } = await initEmptyEdgelessState(page);
    await initSixParagraphs(page);

    await switchEditorMode(page);
    await selectNoteInEdgeless(page, noteId);
    // note slicer button should not be visible when note slicer setting is disenabled
    await expect(page.locator('.note-slicer-button')).toBeHidden();
    await expect(page.locator('.note-slicer-dividing-line')).toHaveCount(0);

    await triggerComponentToolbarAction(page, 'changeNoteSlicerSetting');
    // note slicer button should be visible when note slicer setting is enabled
    await expect(page.locator('.note-slicer-button')).toBeVisible();
    await expect(page.locator('.note-slicer-dividing-line')).toHaveCount(5);
  });

  test('note slicer will add new note', async ({ page }) => {
    await enterPlaygroundRoom(page);
    const { noteId } = await initEmptyEdgelessState(page);
    await initSixParagraphs(page);

    await switchEditorMode(page);
    await expect(page.locator('affine-edgeless-note')).toHaveCount(1);

    await selectNoteInEdgeless(page, noteId);
    await triggerComponentToolbarAction(page, 'changeNoteSlicerSetting');
    await expect(page.locator('.note-slicer-button')).toBeVisible();

    await page.locator('.note-slicer-button').click();

    await expect(page.locator('affine-edgeless-note')).toHaveCount(2);
  });

  test('note slicer button should appears at right position', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    const { noteId } = await initEmptyEdgelessState(page);
    await initThreeParagraphs(page);
    await assertRichTexts(page, ['123', '456', '789']);

    await switchEditorMode(page);
    await selectNoteInEdgeless(page, noteId);
    await triggerComponentToolbarAction(page, 'changeNoteSlicerSetting');

    const blocks = await page
      .locator(`[data-block-id="${noteId}"] [data-block-id]`)
      .all();
    expect(blocks.length).toBe(3);

    const firstBlockRect = await blocks[0].boundingBox();
    assertRectExist(firstBlockRect);
    const secondBlockRect = await blocks[1].boundingBox();
    assertRectExist(secondBlockRect);
    await page.mouse.move(
      secondBlockRect.x + 1,
      secondBlockRect.y + secondBlockRect.height / 2
    );

    let slicerButtonRect = await page
      .locator('.note-slicer-button')
      .boundingBox();
    assertRectExist(slicerButtonRect);

    let buttonRectMiddle = slicerButtonRect.y + slicerButtonRect.height / 2;

    expect(buttonRectMiddle).toBeGreaterThan(
      firstBlockRect.y + firstBlockRect.height
    );
    expect(buttonRectMiddle).toBeGreaterThan(secondBlockRect.y);

    const thirdBlockRect = await blocks[2].boundingBox();
    assertRectExist(thirdBlockRect);
    await page.mouse.move(
      thirdBlockRect.x + 1,
      thirdBlockRect.y + thirdBlockRect.height / 2
    );

    slicerButtonRect = await page.locator('.note-slicer-button').boundingBox();
    assertRectExist(slicerButtonRect);

    buttonRectMiddle = slicerButtonRect.y + slicerButtonRect.height / 2;
    expect(buttonRectMiddle).toBeGreaterThan(
      secondBlockRect.y + secondBlockRect.height
    );
    expect(buttonRectMiddle).toBeLessThan(thirdBlockRect.y);
  });

  test('note slicer button should appears at right position when editor is not located at left top corner', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    const { noteId } = await initEmptyEdgelessState(page);
    await initThreeParagraphs(page);
    await assertRichTexts(page, ['123', '456', '789']);

    await switchEditorMode(page);
    await selectNoteInEdgeless(page, noteId);

    await page.evaluate(() => {
      const el = document.createElement('div');
      const app = document.querySelector('#app') as HTMLElement;

      el.style.height = '100px';
      el.style.background = 'red';

      app!.style.paddingLeft = '80px';

      document.body.insertBefore(el, app);
    });

    const blocks = await page
      .locator(`[data-block-id="${noteId}"] [data-block-id]`)
      .all();
    expect(blocks.length).toBe(3);

    const firstBlockRect = await blocks[0].boundingBox();
    assertRectExist(firstBlockRect);
    const secondBlockRect = await blocks[1].boundingBox();
    assertRectExist(secondBlockRect);

    await triggerComponentToolbarAction(page, 'changeNoteSlicerSetting');
    await page.mouse.move(
      secondBlockRect.x + 1,
      secondBlockRect.y + secondBlockRect.height / 2
    );

    const slicerButtonRect = await page
      .locator('.note-slicer-button')
      .boundingBox();
    assertRectExist(slicerButtonRect);

    const buttonRectMiddle = slicerButtonRect.y + slicerButtonRect.height / 2;

    expect(buttonRectMiddle).toBeGreaterThan(
      firstBlockRect.y + firstBlockRect.height
    );
    expect(buttonRectMiddle).toBeGreaterThan(secondBlockRect.y);
  });
});
