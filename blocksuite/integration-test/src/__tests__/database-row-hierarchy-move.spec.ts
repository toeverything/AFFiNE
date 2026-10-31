import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { addNote } from './utils/edgeless.js';
import { setupEditor } from './utils/setup.js';

// Phase 3 (LIST-05, D-02): `DatabaseBlockDataSource.rowMove`'s self-collision
// branch (`if (target?.id === rowId) { return; }`) used to silently drop any
// pending hierarchy level set via `setPendingHierarchyLevel` just before the
// call, whenever the resolved drop target collided with the row's own
// current position (e.g. dragging a row onto its immediately-preceding
// sibling — no real reorder needed). It now falls through to
// `applyPendingHierarchyLevel` (Phase 2's CR-01 fix, already used by the
// keyboard-toolbar's indent/outdent buttons) so the level change still
// commits.
describe('DatabaseBlockDataSource.rowMove self-collision hardening (Phase 3, LIST-05/D-02)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  async function seedThreeTodoRows() {
    const { DatabaseBlockDataSource } =
      await import('@blocksuite/affine/blocks/database');

    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );

    const dbModel = doc.getModelById(databaseId)!;
    const datasource = new DatabaseBlockDataSource(dbModel as never);

    const rowA = datasource.rowAddAsTodoList('end');
    const rowB = datasource.rowAddAsTodoList('end');
    const rowC = datasource.rowAddAsTodoList('end');

    return { dbModel, datasource, rowA, rowB, rowC };
  }

  test('dragging a row onto its immediately-preceding sibling (collision, no real reorder) still commits the pending level', async () => {
    const { dbModel, datasource, rowA, rowB, rowC } = await seedThreeTodoRows();

    // C's immediately-preceding sibling is B. Dropping C with `before:
    // false` relative to B resolves to C's own current index — the exact
    // self-collision case this fix targets.
    datasource.setPendingHierarchyLevel(rowC, 1);
    datasource.rowMove(rowC, { id: rowB, before: false });

    expect(datasource.getRowHierarchyLevel(rowC)).toBe(1);
    // Row order is unchanged — no real reorder happened, only the level.
    expect(dbModel.children.map(child => child.id)).toEqual([rowA, rowB, rowC]);
  });

  test('a genuine reposition (target is a different row) still moves the row exactly as before', async () => {
    const { dbModel, datasource, rowA, rowB, rowC } = await seedThreeTodoRows();

    datasource.rowMove(rowC, { id: rowA, before: true });

    expect(dbModel.children.map(child => child.id)).toEqual([rowC, rowA, rowB]);
  });

  // CR-03 regression: the self-collision guard above (`target?.id === rowId`)
  // only ever caught the literal self-target case. The broader "drop a row
  // onto its own descendant" collision -- trivially reachable via ordinary
  // drag-and-drop, since a row's own indented children remain rendered
  // (and thus droppable-onto) directly beneath it while it is being
  // dragged -- used to fall through to a silently no-op'd `moveBlocks` call
  // (`Store.moveBlocks` refuses to move a subtree onto a target inside that
  // same subtree, logging a `console.error`), followed unconditionally by
  // `recomputeHierarchyMetadataAfterMove`. This proves the extended guard
  // now catches that case too, without ever reaching the doomed
  // `doc.moveBlocks` call.
  test('dropping a row onto its own descendant also falls through to the pending-level recompute, without ever calling the doomed moveBlocks', async () => {
    const { dbModel, datasource, rowA, rowB, rowC } = await seedThreeTodoRows();

    // Nest rowB as rowA's indented child (level 1) -- `_resolveMovingSubtree`
    // defines "descendant" purely by contiguous higher hierarchy level, so
    // this alone is enough to make B part of A's moving subtree.
    datasource.applyTaskHierarchyMutation(
      new Map([[rowB, 1]]),
      new Map(),
      new Map()
    );
    expect(datasource.getRowHierarchyLevel(rowB)).toBe(1);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      // Drop A "before" its own child B -- resolves the drop target to B
      // itself, a descendant of A (per LIST-05/D-02's own reasoning about
      // the collision guard only covering the exact self-target case).
      datasource.setPendingHierarchyLevel(rowA, 2);
      datasource.rowMove(rowA, { id: rowB, before: true });
    } finally {
      errorSpy.mockRestore();
    }

    // No real reorder happened (the target was inside the moving subtree)
    // -- document order must be unchanged.
    expect(dbModel.children.map(child => child.id)).toEqual([rowA, rowB, rowC]);
    // The pending level still commits via the same fallback the
    // self-collision case already uses above -- not silently dropped.
    expect(datasource.getRowHierarchyLevel(rowA)).toBe(2);
    // `Store.moveBlocks`'s own internal collision guard (`console.error` +
    // no-op) must never fire -- the extended guard short-circuits before
    // ever calling `doc.moveBlocks` with a target inside the set being
    // moved.
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
