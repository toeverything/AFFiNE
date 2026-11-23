import { expect, type Page } from '@playwright/test';

import {
  addNote,
  autoFit,
  createFrame as _createFrame,
  dragBetweenViewCoords,
  edgelessCommonSetup,
  getFrameTitle,
  getSelectedBound,
  toModelCoord,
  zoomOutByKeyboard,
  zoomResetByKeyboard,
} from '../../utils/actions/edgeless.js';
import {
  pressBackspace,
  pressEnter,
  pressEscape,
  type,
} from '../../utils/actions/keyboard.js';
import { waitNextFrame } from '../../utils/actions/misc.js';
import { assertRectExist } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

const createFrame = async (
  page: Page,
  coord1: [number, number],
  coord2: [number, number]
) => {
  const frame = await _createFrame(page, coord1, coord2);
  await autoFit(page);
  return frame;
};

test.beforeEach(async ({ page }) => {
  await edgelessCommonSetup(page);
  await zoomResetByKeyboard(page);
});

const enterFrameTitleEditor = async (page: Page) => {
  const frameTitle = page.locator('affine-frame-title');
  await frameTitle.dblclick();

  const frameTitleEditor = page.locator('edgeless-frame-title-editor');
  await frameTitleEditor.waitFor({
    state: 'attached',
  });
  return frameTitleEditor;
};

test.describe('frame title rendering', () => {
  test('frame title should be displayed', async ({ page }) => {
    const frame = await createFrame(page, [50, 50], [150, 150]);

    const frameTitle = getFrameTitle(page, frame);
    await expect(frameTitle).toBeVisible();
    await expect(frameTitle).toHaveText('Frame 1');
  });

  // TODO(@L-Sun): For support frame title draggable, we temporarily change frame title from root widget to frame widget,
  // which make the z-index is not longer on the top. Because we need move the selection logic of frame title to the EdgelessInteraction
  // where we can use the externalBound to check if the frame title is click.
  test.fixme('frame title should be rendered on the top', async ({ page }) => {
    const frame = await createFrame(page, [50, 50], [150, 150]);

    const frameTitle = getFrameTitle(page, frame);
    await expect(frameTitle).toBeVisible();

    const frameTitleBounding = await frameTitle.boundingBox();
    expect(frameTitleBounding).not.toBeNull();
    if (!frameTitleBounding) return;

    const frameTitleCenter = [
      frameTitleBounding.x + frameTitleBounding.width / 2,
      frameTitleBounding.y + frameTitleBounding.height / 2,
    ];

    await addNote(page, '', frameTitleCenter[0], frameTitleCenter[1]);
    await pressEscape(page, 3);
    await waitNextFrame(page, 500);

    try {
      // if the frame title is rendered on the top, it should be clickable
      await frameTitle.click();
    } catch {
      expect(true, 'frame title should be rendered on the top').toBeFalsy();
    }
  });

  test('should not display frame title component when title is empty', async ({
    page,
  }) => {
    const frame = await createFrame(page, [50, 50], [150, 150]);
    await enterFrameTitleEditor(page);

    await pressBackspace(page);
    await pressEnter(page);
    const frameTitle = getFrameTitle(page, frame);
    await expect(frameTitle).toBeHidden();
  });
});

test.describe('frame title editing', () => {
  test('edit frame title by db-click title', async ({ page }) => {
    const frame = await createFrame(page, [50, 50], [150, 150]);
    const frameTitle = getFrameTitle(page, frame);

    await enterFrameTitleEditor(page);

    await type(page, 'ABC');
    await pressEnter(page);
    await expect(frameTitle).toHaveText('ABC');
  });

  test('frame title can be edited repeatedly', async ({ page }) => {
    const frame = await createFrame(page, [50, 50], [150, 150]);
    const frameTitle = getFrameTitle(page, frame);

    await enterFrameTitleEditor(page);
    await type(page, 'ABC');
    await pressEnter(page);

    await enterFrameTitleEditor(page);
    await type(page, 'DEF');
    await pressEnter(page);
    await expect(frameTitle).toHaveText('DEF');
  });

  test('edit frame after zoom', async ({ page }) => {
    const frame = await createFrame(page, [50, 50], [150, 150]);
    const frameTitle = getFrameTitle(page, frame);

    await zoomOutByKeyboard(page);
    await enterFrameTitleEditor(page);
    await type(page, 'ABC');
    await pressEnter(page);
    await expect(frameTitle).toHaveText('ABC');
  });

  test('edit frame title after drag', async ({ page }) => {
    const frame = await createFrame(page, [50, 50], [150, 150]);
    const frameTitle = getFrameTitle(page, frame);
    await dragBetweenViewCoords(page, [50 + 10, 50 + 10], [50 + 20, 50 + 20]);

    await enterFrameTitleEditor(page);
    await type(page, 'ABC');
    await pressEnter(page);
    await expect(frameTitle).toHaveText('ABC');
  });

  test('blur unmount frame editor', async ({ page }) => {
    await createFrame(page, [50, 50], [150, 150]);
    const frameTitleEditor = await enterFrameTitleEditor(page);
    await page.mouse.click(10, 10);
    await expect(frameTitleEditor).toHaveCount(0);
  });

  test('enter unmount frame editor', async ({ page }) => {
    await createFrame(page, [50, 50], [150, 150]);
    const frameTitleEditor = await enterFrameTitleEditor(page);
    await pressEnter(page);
    await expect(frameTitleEditor).toHaveCount(0);
  });
});

test('frame title should be draggable', async ({ page }) => {
  const frame = await createFrame(page, [50, 50], [150, 150]);
  const frameTitle = getFrameTitle(page, frame);
  const frameTitleRect = await frameTitle.boundingBox();
  assertRectExist(frameTitleRect);

  const center = await toModelCoord(page, [
    frameTitleRect.x + frameTitleRect.width / 2,
    frameTitleRect.y + frameTitleRect.height / 2,
  ]);

  await dragBetweenViewCoords(page, center, [center[0] + 10, center[1] + 10]);
  const frameRect = await getSelectedBound(page);
  expect(frameRect).toEqual([60, 60, 100, 100]);
});
