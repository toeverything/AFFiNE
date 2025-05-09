import { undoByClick } from '../utils/actions/click.js';
import {
  createShapeElement,
  dragBetweenViewCoords,
  edgelessCommonSetup,
  Shape,
} from '../utils/actions/edgeless.js';
import { waitNextFrame } from '../utils/actions/misc.js';
import { assertSelectedBound } from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test.describe('snap', () => {
  test('snap', async ({ page }) => {
    await edgelessCommonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [300, 0], [300 + 100, 100], Shape.Square);

    await assertSelectedBound(page, [300, 0, 100, 100]);

    await dragBetweenViewCoords(page, [350, 50], [350, 50 + 10]);
    await assertSelectedBound(page, [300, 10, 100, 100]);

    await undoByClick(page);
    await dragBetweenViewCoords(page, [350, 50], [350, 50 + 7]);
    await assertSelectedBound(page, [300, 0, 100, 100]);
  });

  test('snapDistribute', async ({ page }) => {
    await edgelessCommonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [300, 0], [300 + 100, 100], Shape.Square);
    await createShapeElement(page, [144, 0], [144 + 100, 100], Shape.Square);

    await assertSelectedBound(page, [144, 0, 100, 100]);
    await dragBetweenViewCoords(
      page,
      [144 + 100 - 9, 100 - 9],
      [144 + 100 - 9 + 3, 100 - 9]
    );
    await assertSelectedBound(page, [150, 0, 100, 100]);
    await waitNextFrame(page);
  });
});
