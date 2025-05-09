import { click } from '../utils/actions/click.js';
import { dragBetweenCoords } from '../utils/actions/drag.js';
import {
  addBasicRectShapeElement,
  deleteAll,
  getNoteBoundBoxInEdgeless,
  setEdgelessTool,
  switchEditorMode,
} from '../utils/actions/edgeless.js';
import {
  enterPlaygroundRoom,
  initEmptyEdgelessState,
} from '../utils/actions/misc.js';
import {
  assertBlockCount,
  assertEdgelessNonSelectedRect,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test('erase shape', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  await deleteAll(page);

  await addBasicRectShapeElement(page, { x: 0, y: 0 }, { x: 100, y: 100 });
  await setEdgelessTool(page, 'eraser');

  await dragBetweenCoords(page, { x: 50, y: 150 }, { x: 50, y: 50 });
  await click(page, { x: 50, y: 50 });
  await assertEdgelessNonSelectedRect(page);
});

test('erase note', async ({ page }) => {
  await enterPlaygroundRoom(page);
  const { noteId } = await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await assertBlockCount(page, 'edgeless-note', 1);

  await setEdgelessTool(page, 'eraser');
  const box = await getNoteBoundBoxInEdgeless(page, noteId);
  await dragBetweenCoords(
    page,
    { x: 0, y: 0 },
    { x: box.x + 10, y: box.y + 10 }
  );
  await assertBlockCount(page, 'edgeless-note', 0);
});
