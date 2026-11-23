import { expect, type Locator, type Page } from '@playwright/test';

import { dragBetweenCoords } from '../utils/actions/drag.js';
import {
  addBasicShapeElement,
  addNote,
  createNote,
  createShapeElement,
  dragBetweenViewCoords,
  edgelessCommonSetup,
  enterPresentationMode,
  getZoomLevel,
  setEdgelessTool,
  Shape,
  switchEditorMode,
  toggleFramePanel,
} from '../utils/actions/edgeless.js';
import { waitNextFrame } from '../utils/actions/index.js';
import {
  assertEdgelessNonSelectedRect,
  assertEdgelessSelectedRect,
  assertZoomLevel,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

async function dragFrameCard(
  page: Page,
  fromCard: Locator,
  toCard: Locator,
  direction: 'up' | 'down' = 'down'
) {
  const fromRect = await fromCard.boundingBox();
  const toRect = await toCard.boundingBox();
  // drag to the center of the toCard
  const center = { x: toRect!.width / 2, y: toRect!.height / 2 };
  const offset = direction === 'up' ? { x: 0, y: -20 } : { x: 0, y: 20 };
  await page.mouse.move(fromRect!.x + center.x, fromRect!.y + center.y);
  await page.mouse.down();
  await page.mouse.move(
    toRect!.x + center.x + offset.x,
    toRect!.y + center.y + offset.y,
    { steps: 10 }
  );
  await page.mouse.up();
}

test.describe('frame panel', () => {
  test('should display empty placeholder when no frames', async ({ page }) => {
    await edgelessCommonSetup(page);
    await toggleFramePanel(page);
    const frameCards = page.locator('affine-frame-card');
    expect(await frameCards.count()).toBe(0);

    const placeholder = page.locator('.no-frame-placeholder');
    expect(await placeholder.isVisible()).toBeTruthy();
  });

  test('should display frame cards when there are frames', async ({ page }) => {
    await edgelessCommonSetup(page);
    await toggleFramePanel(page);

    await addBasicShapeElement(
      page,
      { x: 300, y: 300 },
      { x: 350, y: 350 },
      Shape.Square
    );

    await addNote(page, 'hello', 150, 500);

    await page.mouse.click(0, 0);

    await setEdgelessTool(page, 'frame');
    await dragBetweenCoords(page, { x: 250, y: 250 }, { x: 360, y: 360 });

    await setEdgelessTool(page, 'frame');
    await dragBetweenCoords(page, { x: 100, y: 440 }, { x: 600, y: 600 });

    const frames = page.locator('affine-frame');
    expect(await frames.count()).toBe(2);
    const frameCards = page.locator('affine-frame-card');
    expect(await frameCards.count()).toBe(2);
  });

  test('should render edgeless note correctly in frame preview', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await toggleFramePanel(page);

    await addNote(page, 'hello', 150, 500);

    await page.mouse.click(0, 0);

    await setEdgelessTool(page, 'frame');
    await dragBetweenCoords(page, { x: 100, y: 440 }, { x: 600, y: 600 });
    await waitNextFrame(page, 100);

    const frames = page.locator('affine-frame');
    expect(await frames.count()).toBe(1);
    const frameCards = page.locator('affine-frame-card');
    expect(await frameCards.count()).toBe(1);
    const edgelessNote = page.locator('affine-frame-card affine-edgeless-note');
    expect(await edgelessNote.count()).toBe(1);
  });

  test('should update panel when frames change', async ({ page }) => {
    await edgelessCommonSetup(page);
    await toggleFramePanel(page);
    const frameCards = page.locator('affine-frame-card');
    expect(await frameCards.count()).toBe(0);

    await addNote(page, 'hello', 150, 500);

    await page.mouse.click(0, 0);

    await setEdgelessTool(page, 'frame');
    await dragBetweenCoords(page, { x: 100, y: 440 }, { x: 600, y: 600 });

    await setEdgelessTool(page, 'frame');
    await dragBetweenCoords(page, { x: 50, y: 300 }, { x: 120, y: 400 });
    await waitNextFrame(page);

    const frames = page.locator('affine-frame');
    expect(await frames.count()).toBe(2);
    expect(await frameCards.count()).toBe(2);

    await page.mouse.click(50, 300);
    await page.keyboard.press('Delete');
    await waitNextFrame(page);

    expect(await frames.count()).toBe(1);
    expect(await frameCards.count()).toBe(1);
  });

  test.describe('frame panel behavior after mode switch', () => {
    async function setupFrameTest(page: Page) {
      await edgelessCommonSetup(page);
      await toggleFramePanel(page);

      await addNote(page, 'hello', 150, 500);
      await page.mouse.click(0, 0);
      await waitNextFrame(page, 100);

      await setEdgelessTool(page, 'frame');
      await dragBetweenCoords(
        page,
        { x: 100, y: 440 },
        { x: 640, y: 600 },
        { steps: 10 }
      );
      await waitNextFrame(page, 100);

      const edgelessNote = page.locator(
        'affine-frame-card affine-edgeless-note'
      );
      expect(await edgelessNote.count()).toBe(1);

      return edgelessNote;
    }

    test('should render edgeless note correctly after mode switch', async ({
      page,
    }) => {
      const edgelessNote = await setupFrameTest(page);

      const initialNoteRect = await edgelessNote.boundingBox();
      expect(initialNoteRect).not.toBeNull();

      const {
        width: noteWidth,
        height: noteHeight,
        x: noteX,
        y: noteY,
      } = initialNoteRect!;

      const checkNoteRect = async () => {
        expect(await edgelessNote.count()).toBe(1);

        const newNoteRect = await edgelessNote.boundingBox();
        expect(newNoteRect).not.toBeNull();

        expect(newNoteRect!.width).toBe(noteWidth);
        expect(newNoteRect!.height).toBe(noteHeight);
        expect(newNoteRect!.x).toBe(noteX);
        expect(newNoteRect!.y).toBe(noteY);
      };

      await switchEditorMode(page);
      await checkNoteRect();

      await switchEditorMode(page);
      await checkNoteRect();
    });

    test('should update frame preview when note is moved', async ({ page }) => {
      const edgelessNote = await setupFrameTest(page);

      const initialNoteRect = await edgelessNote.boundingBox();
      expect(initialNoteRect).not.toBeNull();

      await switchEditorMode(page);
      await switchEditorMode(page);

      async function moveNoteAndCheck(
        start: { x: number; y: number },
        end: { x: number; y: number },
        comparison: 'greaterThan' | 'lessThan'
      ) {
        await dragBetweenCoords(page, start, end);
        await waitNextFrame(page);

        const newNoteRect = await edgelessNote.boundingBox();
        expect(newNoteRect).not.toBeNull();

        if (comparison === 'greaterThan') {
          expect(newNoteRect!.x).toBeGreaterThan(initialNoteRect!.x);
          expect(newNoteRect!.y).toBeGreaterThan(initialNoteRect!.y);
        } else {
          expect(newNoteRect!.x).toBeLessThan(initialNoteRect!.x);
          expect(newNoteRect!.y).toBeLessThan(initialNoteRect!.y);
        }
      }

      // Move the note to the right
      await moveNoteAndCheck(
        { x: 150, y: 500 },
        { x: 200, y: 550 },
        'greaterThan'
      );

      // Move the note back to the left
      await moveNoteAndCheck(
        { x: 200, y: 550 },
        { x: 100, y: 450 },
        'lessThan'
      );

      // Move the note diagonally
      await moveNoteAndCheck(
        { x: 100, y: 450 },
        { x: 250, y: 600 },
        'greaterThan'
      );
    });
  });

  test.describe('select and de-select frame', () => {
    async function setupFrameTest(page: Page) {
      await edgelessCommonSetup(page);
      await toggleFramePanel(page);

      await addNote(page, 'hello', 150, 500);

      await page.mouse.click(0, 0);

      await setEdgelessTool(page, 'frame');
      await dragBetweenCoords(page, { x: 100, y: 440 }, { x: 640, y: 600 });
      await waitNextFrame(page);

      const frames = page.locator('affine-frame');
      const frameCards = page.locator('affine-frame-card');
      expect(await frames.count()).toBe(1);
      expect(await frameCards.count()).toBe(1);

      return { frames, frameCards };
    }

    test('by click on frame card', async ({ page }) => {
      const { frameCards } = await setupFrameTest(page);

      // click on the first frame card
      await frameCards.nth(0).click();
      await assertEdgelessSelectedRect(page, [100, 440, 540, 160]);

      await frameCards.nth(0).click();
      await assertEdgelessNonSelectedRect(page);
    });

    test('by click on blank area', async ({ page }) => {
      const { frameCards } = await setupFrameTest(page);

      // click on the first frame card
      await frameCards.nth(0).click();
      await assertEdgelessSelectedRect(page, [100, 440, 540, 160]);

      const framePanel = page.locator('.frame-panel-container');
      const panelRect = await framePanel.boundingBox();
      expect(panelRect).not.toBeNull();
      const { x, y, width, height } = panelRect!;
      await page.mouse.click(x + width / 2, y + height / 2);
      await assertEdgelessNonSelectedRect(page);
    });
  });

  test('should fit the viewport to the frame when double click frame card', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await toggleFramePanel(page);

    await assertZoomLevel(page, 100);

    await addNote(page, 'hello', 150, 500);
    await page.mouse.click(0, 0);

    await setEdgelessTool(page, 'frame');
    await dragBetweenCoords(page, { x: 100, y: 440 }, { x: 600, y: 600 });
    await waitNextFrame(page);

    const frameCards = page.locator('affine-frame-card');
    await frameCards.nth(0).dblclick();

    const zoomLevel = await getZoomLevel(page);
    expect(zoomLevel).toBeGreaterThan(100);
  });

  test('should reorder frames when drag and drop frame card', async ({
    page,
  }) => {
    await edgelessCommonSetup(page);
    await createShapeElement(page, [100, 100], [200, 200], Shape.Square);
    await createNote(page, [300, 100], 'hello');

    // Frame shape
    await setEdgelessTool(page, 'frame');
    await dragBetweenViewCoords(page, [80, 80], [220, 220]);
    await waitNextFrame(page, 100);

    // Frame note
    await setEdgelessTool(page, 'frame');
    await dragBetweenViewCoords(page, [240, 0], [800, 200]);

    expect(await page.locator('affine-frame').count()).toBe(2);

    await toggleFramePanel(page);

    const frameCards = page.locator('affine-frame-card');
    expect(await frameCards.count()).toBe(2);

    // Drag the first frame card to the second
    await dragFrameCard(page, frameCards.nth(0), frameCards.nth(1));

    await enterPresentationMode(page);
    await waitNextFrame(page, 100);

    // Check if frame contains note now is the first
    const edgelessNote = page.locator(
      'affine-edgeless-root affine-edgeless-note'
    );
    await expect(edgelessNote).toBeVisible();
  });
});
