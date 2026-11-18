import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import {
  defaultKeyboardToolbarConfig,
  type KeyboardToolbarActionItem,
} from '@blocksuite/affine-widget-keyboard-toolbar';
import { type BlockComponent, TextSelection } from '@blocksuite/std';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import {
  createStubVirtualKeyboardExtension,
  enableMobileDatabaseEditing,
} from './utils.js';

// Phase 2 (MOBILE-08, D-03): proves the keyboard-toolbar's existing
// indent/outdent buttons (`RightTab`/`CollapseTab`, previously only
// paragraph/list-aware) now also recognize a focused database List-view row
// and drive it through the existing `DatabaseBlockDataSource.rowMove`/
// `setPendingHierarchyLevel` hierarchy pipeline (already built for Story
// 2.8's desktop drag gesture) — the missing touch-friendly, non-drag
// trigger. `defaultKeyboardToolbarConfig.items`'s `RightTab`/`CollapseTab`
// entries are top-level (not nested in a group, unlike Database items), so
// they're located directly by `name` in the flat `items` array.
function findTab(name: 'RightTab' | 'CollapseTab'): KeyboardToolbarActionItem {
  const item = defaultKeyboardToolbarConfig.items.find(
    (item): item is KeyboardToolbarActionItem =>
      'name' in item && item.name === name
  );
  expect(item).toBeTruthy();
  return item!;
}

const ctx = {
  rootComponent: {} as BlockComponent,
  closeToolPanel: () => {},
};

// A database List-view row is rendered by data-view's own renderer, not as
// a standard block-tree `BlockComponent` — its title cell is explicitly
// `data-not-block-text` and carries no `data-block-id`, so it never
// participates in blocksuite's own std.selection (TextSelection/
// BlockSelection) system. Its "focus" only ever shows up as
// `document.activeElement` landing inside `.affine-data-view-list-row`
// (the row's own `tabindex="0"`, matching a real row-select tap), which is
// exactly what `getFocusedDatabaseListRow` (config.ts) reads.
function focusRow(rowId: string) {
  const rowEl = document.querySelector(
    `.affine-data-view-list-row[data-row-id="${rowId}"]`
  ) as HTMLElement | null;
  expect(rowEl).toBeTruthy();
  rowEl!.focus();
}

describe('keyboard-toolbar indent/outdent touch reachability for database rows (Phase 2, MOBILE-08)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page', [
      createStubVirtualKeyboardExtension(),
    ]);
    return cleanup;
  });

  async function seedListViewWithTwoRows() {
    // `DatabaseBlockDataSource.readonly$` ANDs in `IS_MOBILE &&
    // !getFlag('enable_mobile_database_editing')` (opt-in, defaults `false`
    // at the blocksuite level regardless of this plan's Task 1 app-level
    // default flip — see this plan's own `<interfaces>` note) — enabled here
    // to exercise the writable indent/outdent path, matching
    // `list-touch.spec.ts`/`calendar-touch.spec.ts`'s established pattern.
    enableMobileDatabaseEditing(doc);
    const noteId = addNote(doc);
    const canonicalDbId = doc.addBlock('affine:database', {}, noteId);
    const canonicalModel = doc.getModelById(
      canonicalDbId
    ) as DatabaseBlockModel;
    const dataSource = new DatabaseBlockDataSource(canonicalModel);

    const rowA = dataSource.rowAddAsTodoList('end');
    const rowB = dataSource.rowAddAsTodoList('end');

    const listViewId = dataSource.viewManager.viewAdd('list');
    doc.updateBlock(canonicalModel, { currentViewId: listViewId });
    await wait();

    return { dataSource, canonicalModel, rowA, rowB };
  }

  test('indent moves the second row from level 0 to level 1, clamped against its previous sibling; outdent reverses it', async () => {
    const { dataSource, rowB } = await seedListViewWithTwoRows();
    focusRow(rowB);
    await wait();

    const rightTab = findTab('RightTab');
    expect(rightTab.disableWhen?.({ std: editor.std, ...ctx })).toBe(false);

    await rightTab.action?.({ std: editor.std, ...ctx });
    await wait();

    expect(dataSource.getRowHierarchyLevel(rowB)).toBe(1);

    const collapseTab = findTab('CollapseTab');
    expect(collapseTab.disableWhen?.({ std: editor.std, ...ctx })).toBe(false);

    await collapseTab.action?.({ std: editor.std, ...ctx });
    await wait();

    expect(dataSource.getRowHierarchyLevel(rowB)).toBe(0);
  });

  // Regression test for CR-01 (Phase 02 code review): `rowMove`'s
  // self-target trick (`rowMove(rowId, { id: rowId, before: false })`) used
  // to silently no-op whenever the focused row already had at least one
  // child, because the resolved move target landed inside the very subtree
  // being moved and `Store.moveBlocks` rejects that. Indent/outdent now go
  // through `DatabaseBlockDataSource.applyPendingHierarchyLevel`, a
  // level-only path that never calls `doc.moveBlocks`. This seeds a parent
  // row with a real child before outdenting the parent, and asserts both
  // the parent's and the child's levels actually update (previously
  // neither would move).
  test('outdent on a row that has a child updates both levels instead of silently no-oping', async () => {
    const { dataSource, rowB } = await seedListViewWithTwoRows();
    const rightTab = findTab('RightTab');
    const collapseTab = findTab('CollapseTab');

    // Indent rowB under rowA so rowB starts at level 1.
    focusRow(rowB);
    await wait();
    await rightTab.action?.({ std: editor.std, ...ctx });
    await wait();
    expect(dataSource.getRowHierarchyLevel(rowB)).toBe(1);

    // Add a third row after rowB and indent it twice so it nests as rowB's
    // child (level 2) — giving rowB a subtree before outdenting it.
    const rowC = dataSource.rowAddAsTodoList('end');
    await wait();
    focusRow(rowC);
    await wait();
    await rightTab.action?.({ std: editor.std, ...ctx });
    await wait();
    await rightTab.action?.({ std: editor.std, ...ctx });
    await wait();
    expect(dataSource.getRowHierarchyLevel(rowC)).toBe(2);

    // rowB now has a child (rowC). Outdenting rowB previously hit the
    // `rowMove` self-target bug: the computed target landed on rowC
    // (already part of the subtree being moved), so `Store.moveBlocks`
    // silently rejected the move and neither row's level changed, despite
    // `disableWhen` reporting the button as enabled.
    focusRow(rowB);
    await wait();
    expect(collapseTab.disableWhen?.({ std: editor.std, ...ctx })).toBe(false);

    await collapseTab.action?.({ std: editor.std, ...ctx });
    await wait();

    expect(dataSource.getRowHierarchyLevel(rowB)).toBe(0);
    // rowC shifts down by the same delta (-1) so it stays nested one level
    // under rowB.
    expect(dataSource.getRowHierarchyLevel(rowC)).toBe(1);
  });

  test('indent on the first row (no previous sibling) is disabled', async () => {
    const { rowA } = await seedListViewWithTwoRows();
    focusRow(rowA);
    await wait();

    const rightTab = findTab('RightTab');
    expect(rightTab.disableWhen?.({ std: editor.std, ...ctx })).toBe(true);
  });

  test('outdent on a row already at level 0 is disabled', async () => {
    const { rowB } = await seedListViewWithTwoRows();
    focusRow(rowB);
    await wait();

    const collapseTab = findTab('CollapseTab');
    expect(collapseTab.disableWhen?.({ std: editor.std, ...ctx })).toBe(true);
  });

  // Negative control: a plain, non-database paragraph is unaffected by the
  // new database-row path — the pre-existing paragraph/list `tryAll`
  // fallback (which resolves via a genuine TextSelection, matching real
  // paragraph/list indent usage) is still reached and behaves exactly as
  // before.
  test('a plain paragraph with a previous sibling is unaffected: indent still works via the pre-existing paragraph path', async () => {
    const noteId = addNote(doc);
    doc.addBlock('affine:paragraph', {}, noteId);
    const secondId = doc.addBlock('affine:paragraph', {}, noteId);

    const selection = editor.std.selection.create(TextSelection, {
      from: { blockId: secondId, index: 0, length: 0 },
      to: null,
    });
    editor.std.selection.setGroup('note', [selection]);
    await wait();

    const rightTab = findTab('RightTab');
    expect(rightTab.disableWhen?.({ std: editor.std, ...ctx })).toBe(false);
  });
});
