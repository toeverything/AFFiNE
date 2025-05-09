import {
  addNote,
  changeNoteDisplayModeWithId,
  enterPlaygroundRoom,
  initEmptyEdgelessState,
  switchEditorMode,
  zoomResetByKeyboard,
} from '../../utils/actions/index.js';
import { assertBlockCount } from '../../utils/asserts.js';
import { NoteDisplayMode } from '../../utils/bs-alternative.js';
import { test } from '../../utils/playwright.js';

test('Note added on doc mode should display on both modes by default', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  // there should be 1 note in doc page
  await assertBlockCount(page, 'note', 1);

  await switchEditorMode(page);
  // there should be 1 note in edgeless page as well
  await assertBlockCount(page, 'edgeless-note', 1);
});

test('Note added on edgeless mode should display on edgeless only by default', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  await addNote(page, 'note2', 100, 100);

  // assert add note success, there should be 2 notes in edgeless page
  await assertBlockCount(page, 'edgeless-note', 2);

  await switchEditorMode(page);
  // switch to doc mode, the note added on edgeless mode should not render on doc mode
  // there should be only 1 note in doc page
  await assertBlockCount(page, 'note', 1);
});

test('Note can be changed to display on doc and edgeless mode', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  const noteId = await addNote(page, 'note2', 100, 200);
  await page.mouse.click(200, 150);
  // assert add note success, there should be 2 notes in edgeless page
  await assertBlockCount(page, 'edgeless-note', 2);

  // switch to doc mode
  await switchEditorMode(page);
  // there should be 1 notes in doc page
  await assertBlockCount(page, 'note', 1);

  // switch back to edgeless mode
  await switchEditorMode(page);
  // change note display mode to doc only
  await changeNoteDisplayModeWithId(
    page,
    noteId,
    NoteDisplayMode.DocAndEdgeless
  );
  // there should still be 2 notes in edgeless page
  await assertBlockCount(page, 'edgeless-note', 2);

  // switch to doc mode
  await switchEditorMode(page);
  // change successfully, there should be 2 notes in doc page
  await assertBlockCount(page, 'note', 2);
});
