import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import {
  createStubVirtualKeyboardExtension,
  enableMobileDatabaseEditing,
} from './utils.js';

// Phase 3 (LIST-01..04): database List-view rows currently opt out of
// BlockSuite's keymap system entirely (`data-not-block-text`, no
// `data-block-id`), so the already-correct native `ListKeymapExtension`/
// `ParagraphKeymapExtension` never engage for them. This suite proves
// `ListViewRenderer.onRowKeyDown` now reuses those native commands directly
// for Backspace/Delete/Enter, matching native `affine:list`/`affine:paragraph`
// editing behavior end-to-end.
//
// Deviation from the plan's literal file path (`src/__tests__/list-view-
// keyboard-parity.spec.ts`, top-level): `vitest.mobile.config.ts`'s own
// `test.include` only globs `src/__tests__/mobile/**/*.spec.ts` (confirmed
// live: `yarn test:mobile` against the top-level path reports "No test
// files found, exiting with code 1"), while the desktop config's glob is
// the broader `src/__tests__/**/*.spec.ts` and already covers this
// `mobile/` subdirectory -- exactly the existing dual-context pattern this
// package already established for `mobile/keyboard-toolbar-indent-touch.
// spec.ts` and siblings. Moved here (Rule 3 auto-fix, blocking issue) so
// both `yarn test:unit` and `yarn test:mobile` actually execute this file,
// matching the plan's own `<verify>` requirement.
//
// `createStubVirtualKeyboardExtension`/`enableMobileDatabaseEditing` mirror
// `keyboard-toolbar-indent-touch.spec.ts`'s own setup: the mobile page spec
// unconditionally resolves `VirtualKeyboardProvider` (needs the stub), and
// `DatabaseBlockDataSource.readonly$` ANDs in `IS_MOBILE &&
// !getFlag('enable_mobile_database_editing')` -- without opting in, every
// mutating branch under test would silently no-op under the mobile-context
// run specifically (readonly gate), while passing under desktop by
// coincidence. Both calls are no-ops on desktop (`IS_MOBILE` is `false`
// there regardless of the flag), so this setup is safe for both configs.

type InlineEditorLike = {
  setInlineRange: (range: { index: number; length: number }) => void;
  getInlineRange: () => { index: number; length: number } | null;
};

type RichTextElement = HTMLElement & {
  inlineEditor?: InlineEditorLike;
};

async function seedListView(rowCount: number) {
  enableMobileDatabaseEditing(doc);
  const noteId = addNote(doc);
  const databaseId = doc.addBlock('affine:database', {}, noteId);
  await wait();

  const dbModel = doc.getModelById(databaseId) as DatabaseBlockModel;
  const dataSource = new DatabaseBlockDataSource(dbModel);

  const rowIds: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    rowIds.push(dataSource.rowAddAsTodoList('end'));
  }
  await wait();

  const dbEl = document.querySelector(
    `affine-database[data-block-id="${databaseId}"]`
  ) as HTMLElement & {
    dataSource: {
      value: {
        viewManager: {
          viewAdd: (t: string) => string;
          setCurrentView: (id: string) => void;
        };
      };
    };
  };
  const listViewId = dbEl.dataSource.value.viewManager.viewAdd('list');
  dbEl.dataSource.value.viewManager.setCurrentView(listViewId);
  await wait(500);

  return { dataSource, dbModel, dbEl, rowIds };
}

function getRowEl(dbEl: HTMLElement, rowId: string) {
  return dbEl.querySelector(
    `.affine-data-view-list-row[data-row-id="${rowId}"]`
  ) as HTMLElement;
}

async function setRowText(rowId: string, text: string) {
  const model = doc.getModelById(rowId);
  if (!model?.text) {
    throw new Error(`row ${rowId} has no text`);
  }
  model.text.insert(text, 0);
  await wait();
}

async function focusRowAt(rowEl: HTMLElement, index: number) {
  const richText = rowEl.querySelector('rich-text') as RichTextElement | null;
  expect(richText).toBeTruthy();
  const withUpdateComplete = richText as unknown as {
    updateComplete: Promise<boolean>;
  };
  await withUpdateComplete.updateComplete;
  const inlineEditor = richText!.inlineEditor;
  expect(inlineEditor).toBeTruthy();
  inlineEditor!.setInlineRange({ index, length: 0 });
  await wait();
  return richText!;
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

describe('database List-view keyboard editing parity (Phase 3, LIST-01..04)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page', [
      createStubVirtualKeyboardExtension(),
    ]);
    return cleanup;
  });

  test('Backspace at index 0 of a non-first row deletes it, joins its text into the previous row, and focuses the previous row', async () => {
    const { dbEl, rowIds } = await seedListView(2);
    const [row1, row2] = rowIds;
    await setRowText(row1, 'hello');
    await setRowText(row2, 'world');

    const row2El = getRowEl(dbEl, row2);
    await focusRowAt(row2El, 0);

    dispatchKey(row2El, 'Backspace');
    await wait(200);

    expect(doc.getModelById(row2)).toBeFalsy();
    const row1Model = doc.getModelById(row1);
    expect(row1Model?.text?.toString()).toBe('helloworld');
    const row1El = getRowEl(dbEl, row1);
    expect(row1El.contains(document.activeElement)).toBe(true);
  });

  test('Backspace at index 0 of the FIRST row does nothing (no cross-container leak)', async () => {
    const { dbModel, dbEl, rowIds } = await seedListView(1);
    const [row1] = rowIds;
    await setRowText(row1, 'hello');

    const row1El = getRowEl(dbEl, row1);
    await focusRowAt(row1El, 0);

    dispatchKey(row1El, 'Backspace');
    await wait(200);

    const model = doc.getModelById(row1);
    expect(model).toBeTruthy();
    expect(model?.text?.toString()).toBe('hello');
    expect(dbModel.children.length).toBe(1);
  });

  // CR-02 regression: `prevRowId`/`nextRowId` are computed from the
  // view-filtered `rows$.value`, but the actual merge (`mergeWithPrev` ->
  // `getPrevContentBlock`) is a pure block-tree walk with no knowledge of
  // the view's search/filter state. When an active search hides a row
  // between the current row and its filtered-view neighbor, the two
  // diverge -- this proves the fix now bails out rather than silently
  // merging into (and deleting text into) a row the user cannot see.
  test('Backspace does not merge into a row hidden by an active search filter when block-tree adjacency diverges from the filtered view', async () => {
    const { dataSource, dbModel, dbEl, rowIds } = await seedListView(3);
    const [row1, row2, row3] = rowIds;
    await setRowText(row1, 'alpha');
    await setRowText(row2, 'hidden');
    await setRowText(row3, 'alpha again');

    const viewManager = dbEl.dataSource.value.viewManager as unknown as {
      currentViewId$: { value: string };
      viewGet: (id: string) => { setSearch: (str: string) => void };
    };
    const listView = viewManager.viewGet(viewManager.currentViewId$.value);
    listView.setSearch('alpha');
    await wait(200);

    // Filtered view now shows [row1, row3] -- row3's filtered-view previous
    // row is row1, but its real block-tree previous sibling is row2.
    const row3El = getRowEl(dbEl, row3);
    await focusRowAt(row3El, 0);

    dispatchKey(row3El, 'Backspace');
    await wait(200);

    expect(doc.getModelById(row3)).toBeTruthy();
    expect(doc.getModelById(row3)?.text?.toString()).toBe('alpha again');
    expect(doc.getModelById(row2)?.text?.toString()).toBe('hidden');
    expect(doc.getModelById(row1)?.text?.toString()).toBe('alpha');
    expect(dbModel.children.length).toBe(3);
    expect(dataSource.getRowHierarchyLevel(row3)).toBe(0);
  });

  test('Delete at end-of-text with a next row present merges the next row backward, keeping the cursor at the join point', async () => {
    const { dbEl, rowIds } = await seedListView(2);
    const [row1, row2] = rowIds;
    await setRowText(row1, 'hello');
    await setRowText(row2, 'world');

    const row1El = getRowEl(dbEl, row1);
    await focusRowAt(row1El, 'hello'.length);

    dispatchKey(row1El, 'Delete');
    await wait(200);

    expect(doc.getModelById(row2)).toBeFalsy();
    const row1Model = doc.getModelById(row1);
    expect(row1Model?.text?.toString()).toBe('helloworld');
    expect(row1El.contains(document.activeElement)).toBe(true);
  });

  test('Delete at end-of-text on the LAST row does nothing', async () => {
    const { dbModel, dbEl, rowIds } = await seedListView(2);
    const [row1, row2] = rowIds;
    await setRowText(row1, 'hello');
    await setRowText(row2, 'world');

    const row2El = getRowEl(dbEl, row2);
    await focusRowAt(row2El, 'world'.length);

    dispatchKey(row2El, 'Delete');
    await wait(200);

    const model = doc.getModelById(row2);
    expect(model).toBeTruthy();
    expect(model?.text?.toString()).toBe('world');
    expect(dbModel.children.length).toBe(2);
  });

  // Bug 3 live-reproduction (D-04): must run and be recorded BEFORE any fix
  // code for LIST-03/LIST-04's empty-row Enter handling. `data-source.ts`'s
  // `ensureRowAsTodoList` (lines 2624-2660) was the lead suspect -- it
  // resets a row's own `Hierarchy Level` cell to 0, but ONLY when
  // converting a still-`affine:paragraph` row into `affine:list` for the
  // first time; a row that is already `affine:list` returns early without
  // touching level. Since `rowAddAsTodoList` creates the row as
  // `affine:list` directly (never a paragraph needing conversion), and
  // `onRowKeyDown`'s own `ensureTodoListRow(rowId)` call at the top of
  // every keydown is therefore a no-op for it, the live result below
  // determines whether the suspected corruption actually reaches a
  // real root-level Enter press.
  test("Bug 3 live-repro: pressing Enter on a root-level (level 0) row never changes that row's own Hierarchy Level cell", async () => {
    const { dataSource, dbEl, rowIds } = await seedListView(1);
    const [row1] = rowIds;
    await setRowText(row1, 'root task');

    expect(dataSource.getRowHierarchyLevel(row1)).toBe(0);

    const row1El = getRowEl(dbEl, row1);
    await focusRowAt(row1El, 'root task'.length);

    dispatchKey(row1El, 'Enter');
    await wait(200);

    expect(dataSource.getRowHierarchyLevel(row1)).toBe(0);
  });

  test('Enter mid-text on a non-empty, indented (level 1) row splits at the cursor, preserving hierarchy level on the new sibling', async () => {
    const { dataSource, dbModel, dbEl, rowIds } = await seedListView(2);
    const [row1, row2] = rowIds;

    // Indent row2 to level 1 via a real Tab keydown (the existing,
    // already-working Shift-Tab/Tab mechanism), matching this file's
    // established real-dispatch style rather than mutating the column
    // directly.
    const row2El = getRowEl(dbEl, row2);
    row2El.focus();
    dispatchKey(row2El, 'Tab');
    await wait(200);
    expect(dataSource.getRowHierarchyLevel(row2)).toBe(1);

    await setRowText(row2, 'hello world');
    await focusRowAt(row2El, 'hello'.length);

    const rowCountBefore = dbModel.children.length;
    dispatchKey(row2El, 'Enter');
    await wait(200);

    expect(dbModel.children.length).toBe(rowCountBefore + 1);
    const row2Model = doc.getModelById(row2);
    expect(row2Model?.text?.toString()).toBe('hello');

    const row1Index = dbModel.children.findIndex(c => c.id === row1);
    const row2Index = dbModel.children.findIndex(c => c.id === row2);
    const newRowModel = dbModel.children[row2Index + 1];
    expect(row1Index).toBeGreaterThanOrEqual(0);
    expect(newRowModel).toBeTruthy();
    expect(newRowModel?.text?.toString()).toBe(' world');
    expect(dataSource.getRowHierarchyLevel(newRowModel!.id)).toBe(1);
  });

  // CR-01 regression: `splitListCommand` always inserts the new row
  // immediately after the original row -- if the original row already has
  // indented sub-rows (contiguous following rows at a higher hierarchy
  // level), that insertion point sits BEFORE those sub-rows, silently
  // re-parenting them under the new sibling. This proves the fix
  // repositions the new row past the original row's full subtree first.
  test('Enter mid-text on a row with existing indented sub-rows keeps those sub-rows under the original row, not the new sibling', async () => {
    const { dataSource, dbModel, dbEl, rowIds } = await seedListView(3);
    const [row1, row2, row3] = rowIds;

    // Indent row2 and row3 under row1, producing:
    //   row1 (level 0)
    //     row2 (level 1)
    //     row3 (level 1)
    const row2El = getRowEl(dbEl, row2);
    row2El.focus();
    dispatchKey(row2El, 'Tab');
    await wait(200);
    const row3El = getRowEl(dbEl, row3);
    row3El.focus();
    dispatchKey(row3El, 'Tab');
    await wait(200);
    expect(dataSource.getRowHierarchyLevel(row2)).toBe(1);
    expect(dataSource.getRowHierarchyLevel(row3)).toBe(1);

    await setRowText(row1, 'hello world');
    const row1El = getRowEl(dbEl, row1);
    await focusRowAt(row1El, 'hello'.length);

    dispatchKey(row1El, 'Enter');
    await wait(200);

    const row1Model = doc.getModelById(row1);
    expect(row1Model?.text?.toString()).toBe('hello');

    const ids = dbModel.children.map(child => child.id);
    const row1Index = ids.indexOf(row1);
    const row2Index = ids.indexOf(row2);
    const row3Index = ids.indexOf(row3);
    const newRowId = ids.find(id => id !== row1 && id !== row2 && id !== row3);

    // The new sibling must land AFTER row2/row3, not between row1 and
    // them -- otherwise a positional/level-based subtree walker (e.g.
    // `_resolveMovingSubtree`) would re-attribute row2/row3 to the new
    // interloper row the next time either row is moved or re-leveled.
    expect(newRowId).toBeTruthy();
    const newRowIndex = ids.indexOf(newRowId!);
    expect(row2Index).toBe(row1Index + 1);
    expect(row3Index).toBe(row2Index + 1);
    expect(newRowIndex).toBe(row3Index + 1);
    expect(dataSource.getRowHierarchyLevel(row2)).toBe(1);
    expect(dataSource.getRowHierarchyLevel(row3)).toBe(1);
    expect(dataSource.getRowHierarchyLevel(newRowId!)).toBe(0);
    expect(doc.getModelById(newRowId!)?.text?.toString()).toBe(' world');
  });

  test('Enter on an empty, indented (level 1) row unindents it by one level instead of creating a blank row', async () => {
    const { dataSource, dbModel, dbEl, rowIds } = await seedListView(2);
    const [, row2] = rowIds;

    const row2El = getRowEl(dbEl, row2);
    row2El.focus();
    dispatchKey(row2El, 'Tab');
    await wait(200);
    expect(dataSource.getRowHierarchyLevel(row2)).toBe(1);

    const rowCountBefore = dbModel.children.length;
    await focusRowAt(row2El, 0);
    dispatchKey(row2El, 'Enter');
    await wait(200);

    expect(dbModel.children.length).toBe(rowCountBefore);
    expect(dataSource.getRowHierarchyLevel(row2)).toBe(0);
  });

  test("Enter on an empty, root-level (level 0) row creates a new sibling row and never changes the pressed row's own level", async () => {
    const { dataSource, dbModel, dbEl, rowIds } = await seedListView(1);
    const [row1] = rowIds;

    const row1El = getRowEl(dbEl, row1);
    const rowCountBefore = dbModel.children.length;
    await focusRowAt(row1El, 0);
    dispatchKey(row1El, 'Enter');
    await wait(200);

    expect(dbModel.children.length).toBe(rowCountBefore + 1);
    expect(dataSource.getRowHierarchyLevel(row1)).toBe(0);
  });
});
