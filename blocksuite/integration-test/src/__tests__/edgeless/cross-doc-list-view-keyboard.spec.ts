import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import { insertDatabaseViewRefBlockCommand } from '@blocksuite/affine/blocks/database-view-ref';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

// Regression suite for the cross-doc half of LIST-01..04's keyboard editing.
//
// `ListViewRenderer` resolves its `EditorHost` through `EditorHostKey`, which
// `database-block.ts` deliberately binds to the OUTER page's host so that row
// actions creating blocks "on the current page" (Story 2.6 note-linking, peek
// view, settings reads) land where the user is actually looking. When the
// database is rendered *nested*, inside a CROSS-DOC `database-view-ref`/
// `database-ref` preview scope, that outer store contains none of the row
// blocks -- `outerHost.std.store.getBlock(rowId)` returns `undefined` for
// every row.
//
// The Enter branch then conflated "model unresolvable" with "row is empty"
// (`(model?.text?.length ?? 0) > 0` is false either way), so EVERY Enter on a
// cross-doc row -- content or not -- took the empty-row path: dedent at level
// > 0, add-sibling at level 0. A user editing a Journal Todo that references a
// database in another doc saw their indented, text-filled rows silently
// unindent instead of splitting, with no new row created. The same wrong-store
// read also left cross-doc Backspace/Delete row merging permanently dead.
//
// Every existing LIST-01..04 test (`mobile/list-view-keyboard-parity.spec.ts`)
// builds its database in the SAME doc as the editor, where outer host and
// row-owning host are the same object -- which is why the whole suite passed
// while the cross-doc path was broken. These tests pin the cross-doc contract
// specifically, at the hierarchy-level boundaries (0 / 1 / 2) and the cursor
// boundaries (start / end) rather than the single reported case.

type InlineEditorLike = {
  setInlineRange: (range: { index: number; length: number }) => void;
};
type RichTextElement = HTMLElement & { inlineEditor?: InlineEditorLike };

function createSecondDoc() {
  const secondDoc = collection
    .createDoc(`doc:second-${Math.random().toString(16).slice(2, 8)}`)
    .getStore();
  secondDoc.load(() => {
    const rootId = secondDoc.addBlock('affine:page', { title: new Text() });
    secondDoc.addBlock('affine:surface', {}, rootId);
  });
  return secondDoc;
}

function dispatchKey(
  target: HTMLElement,
  key: string,
  opts: Partial<KeyboardEventInit> = {}
) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      composed: true,
      cancelable: true,
      ...opts,
    })
  );
}

/**
 * Builds a todo-style database in a SECOND doc and renders it on the current
 * page through a cross-doc `database-view-ref` with its own list view -- the
 * exact shape a Journal Todo referencing another page's table produces.
 */
async function setupCrossDocListView(rowCount: number) {
  const secondDoc = createSecondDoc();
  const srcNoteId = addNote(secondDoc);
  const databaseId = secondDoc.addBlock(
    'affine:database',
    { title: new Text() },
    srcNoteId
  );
  await wait();

  const dbModel = secondDoc.getModelById(databaseId) as DatabaseBlockModel;
  // A data source over the SOURCE doc's own model, used only to read/assert
  // hierarchy levels independently of whatever the rendered view believes.
  const srcDataSource = new DatabaseBlockDataSource(dbModel);
  const rowIds: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    rowIds.push(srcDataSource.rowAddAsTodoList('end'));
  }
  await wait();

  const noteId = addNote(doc);
  const anchor = doc.getBlock(noteId)!.model.children[0]!;
  const [, result] = editor.std.command.exec(
    insertDatabaseViewRefBlockCommand,
    {
      refBlockId: databaseId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [anchor],
      initialView: { viewType: 'list' },
    }
  );
  await wait(600);

  const refEl = document.querySelector(
    `affine-database-view-ref[data-block-id="${result.insertedDatabaseViewRefBlockId}"]`
  ) as HTMLElement;
  expect(refEl).toBeTruthy();
  expect(refEl.querySelector('affine-data-view-list')).toBeTruthy();

  // The premise of this whole suite: the outer editor's store genuinely
  // cannot see these rows. If this ever stops holding, these tests stop
  // covering what they claim to cover.
  expect(editor.std.store.getBlock(rowIds[0]!)).toBeFalsy();
  expect(secondDoc.getBlock(rowIds[0]!)).toBeTruthy();

  return { secondDoc, dbModel, srcDataSource, refEl, rowIds };
}

function getRowEl(refEl: HTMLElement, rowId: string) {
  return refEl.querySelector(
    `.affine-data-view-list-row[data-row-id="${rowId}"]`
  ) as HTMLElement;
}

async function indentRow(refEl: HTMLElement, rowId: string, times: number) {
  const rowEl = getRowEl(refEl, rowId);
  for (let i = 0; i < times; i++) {
    rowEl.focus();
    dispatchKey(rowEl, 'Tab');
    await wait(200);
  }
}

async function setRowText(store: typeof doc, rowId: string, text: string) {
  const model = store.getModelById(rowId);
  if (!model?.text) throw new Error(`row ${rowId} has no text`);
  model.text.insert(text, 0);
  await wait(200);
}

async function placeCursor(rowEl: HTMLElement, index: number) {
  const richText = rowEl.querySelector('rich-text') as RichTextElement | null;
  expect(richText).toBeTruthy();
  await (richText as unknown as { updateComplete: Promise<boolean> })
    .updateComplete;
  expect(richText!.inlineEditor).toBeTruthy();
  richText!.inlineEditor!.setInlineRange({ index, length: 0 });
  await wait(100);
}

describe('cross-doc database-view-ref list view: keyboard editing', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  // The reported regression, verbatim: content row, cursor at the very end.
  test('Enter at END-of-text on a level-1 row splits into a new sibling at the SAME level instead of unindenting it', async () => {
    const { secondDoc, dbModel, srcDataSource, refEl, rowIds } =
      await setupCrossDocListView(2);
    const [, row2] = rowIds;

    await indentRow(refEl, row2!, 1);
    expect(srcDataSource.getRowHierarchyLevel(row2!)).toBe(1);
    await setRowText(secondDoc, row2!, 'hello');
    await placeCursor(getRowEl(refEl, row2!), 'hello'.length);

    const rowCountBefore = dbModel.children.length;
    dispatchKey(getRowEl(refEl, row2!), 'Enter');
    await wait(400);

    // The pressed row keeps both its text and its level -- this is the exact
    // assertion that failed before the fix (level collapsed 1 -> 0).
    expect(secondDoc.getModelById(row2!)?.text?.toString()).toBe('hello');
    expect(srcDataSource.getRowHierarchyLevel(row2!)).toBe(1);

    // ...and a new empty sibling exists directly after it, at the same level.
    expect(dbModel.children.length).toBe(rowCountBefore + 1);
    const row2Index = dbModel.children.findIndex(c => c.id === row2);
    const newRow = dbModel.children[row2Index + 1];
    expect(newRow).toBeTruthy();
    expect(newRow!.text?.toString()).toBe('');
    expect(srcDataSource.getRowHierarchyLevel(newRow!.id)).toBe(1);
  });

  // Boundary neighbor: the other end of the cursor range. Index 0 exercises
  // the same branch with a non-empty `afterText`, so a fix that only handled
  // "cursor at the end" would not survive this.
  test('Enter at index 0 of a level-1 row moves the text onto the new sibling and keeps both rows at level 1', async () => {
    const { secondDoc, dbModel, srcDataSource, refEl, rowIds } =
      await setupCrossDocListView(2);
    const [, row2] = rowIds;

    await indentRow(refEl, row2!, 1);
    await setRowText(secondDoc, row2!, 'hello');
    await placeCursor(getRowEl(refEl, row2!), 0);

    dispatchKey(getRowEl(refEl, row2!), 'Enter');
    await wait(400);

    expect(secondDoc.getModelById(row2!)?.text?.toString()).toBe('');
    expect(srcDataSource.getRowHierarchyLevel(row2!)).toBe(1);
    const row2Index = dbModel.children.findIndex(c => c.id === row2);
    const newRow = dbModel.children[row2Index + 1];
    expect(newRow?.text?.toString()).toBe('hello');
    expect(srcDataSource.getRowHierarchyLevel(newRow!.id)).toBe(1);
  });

  // Minimum-level boundary. Level 0 was the one case that accidentally still
  // "worked" while broken -- with no level to dedent into it fell through to
  // add-sibling, which looks identical to a correct split when the cursor is
  // at the very end. So this asserts a MID-TEXT split specifically: the broken
  // path appends an empty row and leaves the text whole, the correct path
  // actually divides the text. Otherwise this test would pass either way and
  // pin nothing.
  test('Enter MID-text on a level-0 row divides the text between it and a new sibling at level 0', async () => {
    const { secondDoc, dbModel, srcDataSource, refEl, rowIds } =
      await setupCrossDocListView(1);
    const [row1] = rowIds;

    await setRowText(secondDoc, row1!, 'root task');
    await placeCursor(getRowEl(refEl, row1!), 'root'.length);

    const rowCountBefore = dbModel.children.length;
    dispatchKey(getRowEl(refEl, row1!), 'Enter');
    await wait(400);

    expect(secondDoc.getModelById(row1!)?.text?.toString()).toBe('root');
    expect(srcDataSource.getRowHierarchyLevel(row1!)).toBe(0);
    expect(dbModel.children.length).toBe(rowCountBefore + 1);
    const newRow = dbModel.children[1];
    expect(newRow?.text?.toString()).toBe(' task');
    expect(srcDataSource.getRowHierarchyLevel(newRow!.id)).toBe(0);
  });

  // N+1 boundary: a deeper level must inherit exactly, not clamp to 1 or 0.
  // Needs three rows -- a row can only ever indent to one level below the row
  // above it, so reaching level 2 requires a level-1 row to sit above it.
  test('Enter at END-of-text on a level-2 row splits into a new sibling at level 2', async () => {
    const { secondDoc, dbModel, srcDataSource, refEl, rowIds } =
      await setupCrossDocListView(3);
    const [, row2, row3] = rowIds;

    await indentRow(refEl, row2!, 1);
    await indentRow(refEl, row3!, 2);
    expect(srcDataSource.getRowHierarchyLevel(row2!)).toBe(1);
    expect(srcDataSource.getRowHierarchyLevel(row3!)).toBe(2);
    await setRowText(secondDoc, row3!, 'deep');
    await placeCursor(getRowEl(refEl, row3!), 'deep'.length);

    dispatchKey(getRowEl(refEl, row3!), 'Enter');
    await wait(400);

    expect(secondDoc.getModelById(row3!)?.text?.toString()).toBe('deep');
    expect(srcDataSource.getRowHierarchyLevel(row3!)).toBe(2);
    const row3Index = dbModel.children.findIndex(c => c.id === row3);
    const newRow = dbModel.children[row3Index + 1];
    expect(newRow).toBeTruthy();
    expect(srcDataSource.getRowHierarchyLevel(newRow!.id)).toBe(2);
  });

  // The genuinely-requested LIST-03 feature must still work cross-doc -- the
  // fix narrows *when* the dedent fires, it must not remove it. Without this,
  // "never dedent on Enter" would pass every other test in this file.
  test('Enter on an EMPTY level-1 row still unindents it by one level and creates no row', async () => {
    const { dbModel, srcDataSource, refEl, rowIds } =
      await setupCrossDocListView(2);
    const [, row2] = rowIds;

    await indentRow(refEl, row2!, 1);
    expect(srcDataSource.getRowHierarchyLevel(row2!)).toBe(1);
    await placeCursor(getRowEl(refEl, row2!), 0);

    const rowCountBefore = dbModel.children.length;
    dispatchKey(getRowEl(refEl, row2!), 'Enter');
    await wait(400);

    expect(srcDataSource.getRowHierarchyLevel(row2!)).toBe(0);
    expect(dbModel.children.length).toBe(rowCountBefore);
  });

  // LIST-04's floor: an empty row already at level 0 has nothing to dedent
  // into, so it adds a sibling and never touches its own level.
  test('Enter on an EMPTY level-0 row adds a sibling and leaves its own level at 0', async () => {
    const { dbModel, srcDataSource, refEl, rowIds } =
      await setupCrossDocListView(1);
    const [row1] = rowIds;

    await placeCursor(getRowEl(refEl, row1!), 0);

    const rowCountBefore = dbModel.children.length;
    dispatchKey(getRowEl(refEl, row1!), 'Enter');
    await wait(400);

    expect(dbModel.children.length).toBe(rowCountBefore + 1);
    expect(srcDataSource.getRowHierarchyLevel(row1!)).toBe(0);
  });

  // Collateral damage from the same wrong-store read: LIST-01's merge bailed
  // out on the unresolvable model, so cross-doc Backspace did nothing at all.
  test('Backspace at index 0 of a cross-doc row merges it into the previous row', async () => {
    const { secondDoc, dbModel, refEl, rowIds } =
      await setupCrossDocListView(2);
    const [row1, row2] = rowIds;

    await setRowText(secondDoc, row1!, 'hello');
    await setRowText(secondDoc, row2!, 'world');
    await placeCursor(getRowEl(refEl, row2!), 0);

    dispatchKey(getRowEl(refEl, row2!), 'Backspace');
    await wait(400);

    expect(secondDoc.getModelById(row2!)).toBeFalsy();
    expect(secondDoc.getModelById(row1!)?.text?.toString()).toBe('helloworld');
    expect(dbModel.children.length).toBe(1);
  });
});
