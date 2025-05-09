import { expect } from '@playwright/test';

import {
  createNote,
  createShapeElement,
  decreaseZoomLevel,
  deleteAll,
  getAllSortedIds,
  Shape,
  switchEditorMode,
  toViewCoord,
  triggerComponentToolbarAction,
} from '../utils/actions/edgeless.js';
import {
  copyByKeyboard,
  cutByKeyboard,
  edgelessCommonSetup as commonSetup,
  enterPlaygroundRoom,
  expectConsoleMessage,
  focusTitle,
  getCurrentEditorDocId,
  initEmptyEdgelessState,
  mockParseDocUrlService,
  pasteByKeyboard,
  pasteContent,
  selectAllByKeyboard,
  type,
  waitNextFrame,
} from '../utils/actions/index.js';
import { assertRichImage } from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test.describe('mime', () => {
  test('should paste svg in text/plain mime', async ({ page }) => {
    expectConsoleMessage(page, 'Error: Image sourceId is missing!', 'warning');
    await commonSetup(page);
    const content = {
      'text/plain': `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" />
      <script>alert("Malicious script executed!");</script>
    </svg>
    `,
    };

    await pasteContent(page, content);

    // wait for paste
    await page.waitForTimeout(200);
    await assertRichImage(page, 1);
  });

  test('should not paste bad svg', async ({ page }) => {
    expectConsoleMessage(page, 'BlockSuiteError: val does not exist', 'error');
    expectConsoleMessage(page, 'Error: Image sourceId is missing!', 'warning');

    await commonSetup(page);
    const contents = [
      {
        'text/plain': `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
      <circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" />
      <script>alert("Malicious script executed!");</script>
    `,
      },

      {
        'text/plain': `<svg width="100" height="100">
      <circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" />
      <script>alert("Malicious script executed!");</script>
      </svg>
    `,
      },
    ];
    for (const content of contents) {
      await pasteContent(page, content);
    }

    await assertRichImage(page, 0);
  });
});

test.describe('frame clipboard', () => {
  test('copy and paste frame with shape elements inside', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createNote(page, [100, -100]);
    await page.mouse.click(10, 50);

    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addFrame');
    const originIds = await getAllSortedIds(page);
    expect(originIds.length).toBe(3);

    await copyByKeyboard(page);
    const move = await toViewCoord(page, [250, 250]);
    await page.mouse.move(move[0], move[1]);
    await page.mouse.click(move[0], move[1]);
    await pasteByKeyboard(page, true);
    await waitNextFrame(page, 500);
    const sortedIds = await getAllSortedIds(page);
    expect(sortedIds.length).toBe(6);
  });

  test('copy and paste frame with group elements inside', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createNote(page, [100, -100]);
    await page.mouse.click(10, 50);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');

    await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
    await triggerComponentToolbarAction(page, 'createFrameOnMoreOption');
    const originIds = await getAllSortedIds(page);
    expect(originIds.length).toBe(5);

    await selectAllByKeyboard(page);
    await copyByKeyboard(page);
    const move = await toViewCoord(page, [250, 250]);
    await page.mouse.move(move[0], move[1]);
    await page.mouse.click(move[0], move[1]);
    await pasteByKeyboard(page, true);
    await waitNextFrame(page, 500);
    const sortedIds = await getAllSortedIds(page);
    expect(sortedIds.length).toBe(10);
  });

  test('copy and paste frame with frame inside', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createNote(page, [100, -100]);
    await page.mouse.click(10, 50);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addFrame');

    await decreaseZoomLevel(page);
    await createShapeElement(page, [700, 0], [800, 100], Shape.Square);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addFrame');

    const originIds = await getAllSortedIds(page);
    expect(originIds.length).toBe(5);

    await copyByKeyboard(page);
    const move = await toViewCoord(page, [250, 250]);
    await page.mouse.move(move[0], move[1]);
    await page.mouse.click(move[0], move[1]);
    await pasteByKeyboard(page, true);
    await waitNextFrame(page, 500);
    const sortedIds = await getAllSortedIds(page);
    expect(sortedIds.length).toBe(10);
  });

  test('cut frame with shape elements inside', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createNote(page, [100, -100]);
    await page.mouse.click(10, 50);

    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addFrame');
    const originIds = await getAllSortedIds(page);
    expect(originIds.length).toBe(3);

    await cutByKeyboard(page);
    const move = await toViewCoord(page, [250, 250]);
    await page.mouse.move(move[0], move[1]);
    await page.mouse.click(move[0], move[1]);
    await pasteByKeyboard(page, true);
    await waitNextFrame(page, 500);
    const sortedIds = await getAllSortedIds(page);
    expect(sortedIds.length).toBe(3);
  });
});

test.describe('pasting URLs', () => {
  test('pasting github pr url', async ({ page }) => {
    await commonSetup(page);
    await waitNextFrame(page);
    await pasteContent(page, {
      'text/plain': 'https://github.com/toeverything/blocksuite/pull/7217',
    });

    await expect(
      page.locator('affine-embed-edgeless-github-block')
    ).toBeVisible();
  });

  test('pasting internal link', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await waitNextFrame(page);
    await focusTitle(page);
    const docId = await getCurrentEditorDocId(page);

    await type(page, 'doc title');

    await switchEditorMode(page);
    await deleteAll(page);

    await mockParseDocUrlService(page, {
      'http://workspace/doc-id': docId,
    });

    await pasteContent(page, {
      'text/plain': 'http://workspace/doc-id',
    });

    await expect(
      page.locator('affine-embed-edgeless-linked-doc-block')
    ).toBeVisible();

    await expect(
      page.locator('.affine-embed-linked-doc-content-title')
    ).toHaveText('doc title');
  });

  test('pasting external link', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await waitNextFrame(page);
    await focusTitle(page);

    await type(page, 'doc title');

    await switchEditorMode(page);
    await deleteAll(page);
    await waitNextFrame(page);

    await pasteContent(page, {
      'text/plain': 'https://affine.pro',
    });

    await expect(page.locator('bookmark-card')).toBeVisible();
  });
});
