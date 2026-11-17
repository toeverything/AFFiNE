import {
  addProperty,
  DatabaseBlockDataSource,
  databaseBlockProperties,
  getCell,
  updateCell,
} from '@blocksuite/affine/blocks/database';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import {
  createTaskIdentity,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
} from '@blocksuite/affine/shared/utils';
import { propertyModelPresets } from '@blocksuite/data-view/property-pure-presets';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

/**
 * Regression coverage for a real bug found live (2026-08-13): task-parent-
 * identity `Text` cells (the rich-text column `recomputeParentStatusesFromChildren`/
 * `cascadeStatusToDescendants` read to build the hierarchy) silently read back
 * as *empty* through `getCell` (which reads the reactive `cells$` signal)
 * immediately after being written via `updateCell`, even though the same
 * cell's *plain*, non-signal value was correct — because `SyncController`'s
 * proxy `set` trap (`blocksuite/framework/store/src/model/block/sync-
 * controller.ts`) pushed the signal a pre-Yjs-integration snapshot of a
 * freshly-constructed `Text` (still `_start: null`, no backing Yjs `Item`,
 * `.toString()` === '') instead of re-reading the just-integrated value.
 * This broke every parent/ancestor auto-promotion and auto-demotion
 * computation that depends on reading a just-written hierarchy cell in the
 * same synchronous pass — the exact "parent doesn't auto-complete when
 * children are done" / "sibling status doesn't propagate" behavior reported
 * live. `database.unit.spec.ts` already covers the `DatabaseBlockDataSource`
 * logic itself in an isolated, bare `TestWorkspace` harness; this file
 * exercises the identical scenario through a real, rendered editor
 * document instead, closer to actual app conditions (a real `SyncController`
 * actually mounted, not just constructed programmatically).
 */
describe('task status parent/child cascade (real editor document)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  const selection = [
    { id: 'done', value: 'Done', color: 'var(--affine-tag-white)' },
    { id: 'todo', value: 'TODO', color: 'var(--affine-tag-pink)' },
    { id: 'wip', value: 'WIP', color: 'var(--affine-tag-blue)' },
  ];

  function setupHierarchy(rowCount: 3) {
    const noteId = addNote(doc);
    const databaseId = doc.addBlock('affine:database', {}, noteId);
    const databaseModel = doc.getModelById(databaseId) as DatabaseBlockModel;
    const dataSource = new DatabaseBlockDataSource(databaseModel);

    const statusColumnId = addProperty(
      databaseModel,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      databaseModel,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const rowIds = Array.from({ length: rowCount }, () =>
      doc.addBlock('affine:paragraph', {}, databaseId)
    );

    return {
      databaseModel,
      dataSource,
      statusColumnId,
      parentIdentityColumnId,
      rowIds,
    };
  }

  function linkParent(
    databaseModel: DatabaseBlockModel,
    parentIdentityColumnId: string,
    childRowId: string,
    parentRowId: string
  ) {
    const parentIdentity = createTaskIdentity({
      docId: doc.id,
      blockId: parentRowId,
    });
    updateCell(databaseModel, childRowId, {
      columnId: parentIdentityColumnId,
      value: new Text(parentIdentity),
    });
  }

  test('parent auto-completes once every child is marked done, through a real rendered document', () => {
    const {
      databaseModel,
      dataSource,
      statusColumnId,
      parentIdentityColumnId,
      rowIds,
    } = setupHierarchy(3);
    const [parent, childA, childB] = rowIds;

    linkParent(databaseModel, parentIdentityColumnId, childA!, parent!);
    linkParent(databaseModel, parentIdentityColumnId, childB!, parent!);

    dataSource.cellValueChange(childA!, statusColumnId!, 'done');
    // Only one of two children done — parent must not complete yet.
    expect(getCell(databaseModel, parent!, statusColumnId!)?.value).not.toBe(
      'done'
    );

    dataSource.cellValueChange(childB!, statusColumnId!, 'done');
    // Both children done — parent auto-completes.
    expect(getCell(databaseModel, parent!, statusColumnId!)?.value).toBe(
      'done'
    );
  });

  test('parent demotes back once a child is un-done again, through a real rendered document', () => {
    const {
      databaseModel,
      dataSource,
      statusColumnId,
      parentIdentityColumnId,
      rowIds,
    } = setupHierarchy(3);
    const [parent, childA, childB] = rowIds;

    linkParent(databaseModel, parentIdentityColumnId, childA!, parent!);
    linkParent(databaseModel, parentIdentityColumnId, childB!, parent!);

    dataSource.cellValueChange(childA!, statusColumnId!, 'done');
    dataSource.cellValueChange(childB!, statusColumnId!, 'done');
    expect(getCell(databaseModel, parent!, statusColumnId!)?.value).toBe(
      'done'
    );

    // Un-completing one child must demote the (auto-completed) parent back
    // out of 'done' — this is the exact "Kanban sibling status" rule: any
    // sibling not done means the parent can't be done either.
    dataSource.cellValueChange(childA!, statusColumnId!, 'todo');
    expect(getCell(databaseModel, parent!, statusColumnId!)?.value).not.toBe(
      'done'
    );
  });

  test('parent becomes in-progress as soon as any sibling starts, through a real rendered document', () => {
    const {
      databaseModel,
      dataSource,
      statusColumnId,
      parentIdentityColumnId,
      rowIds,
    } = setupHierarchy(3);
    const [parent, childA, childB] = rowIds;

    linkParent(databaseModel, parentIdentityColumnId, childA!, parent!);
    linkParent(databaseModel, parentIdentityColumnId, childB!, parent!);

    // Neither child started — parent has no status yet.
    expect(
      getCell(databaseModel, parent!, statusColumnId!)?.value
    ).toBeUndefined();

    // One sibling starts (WIP) — parent must reflect "in progress" even
    // though the other sibling hasn't started and this one isn't done.
    dataSource.cellValueChange(childA!, statusColumnId!, 'wip');
    expect(getCell(databaseModel, parent!, statusColumnId!)?.value).toBe('wip');
  });
});
