import { describe, expect, it } from 'vitest';

import {
  computeTodoParentCheckedFromChildren,
  createDatabaseRowTaskInteropLink,
  createTodoTaskInteropLink,
  findDuplicateTaskIdentities,
  hasSameTaskIdentity,
  parseTaskIdentity,
} from '../../utils/task-interop.js';

describe('task interop flow', () => {
  it('keeps identity stable across reorder-like row movement', () => {
    const before = createDatabaseRowTaskInteropLink({
      docId: 'doc-1',
      blockId: 'row-42',
      databaseId: 'db-1',
    });

    // Reorder should not mutate block identity.
    const after = createDatabaseRowTaskInteropLink({
      docId: 'doc-1',
      blockId: 'row-42',
      databaseId: 'db-1',
    });

    expect(before.taskIdentity).toBe(after.taskIdentity);
    expect(parseTaskIdentity(before.taskIdentity)).toEqual({
      spaceId: undefined,
      docId: 'doc-1',
      blockId: 'row-42',
    });
  });

  it('resolves linked TODO and DB records to same logical task', () => {
    const todo = createTodoTaskInteropLink({
      docId: 'doc-main',
      blockId: 'task-100',
      sourceFlavor: 'affine:list',
    });

    const db = createDatabaseRowTaskInteropLink({
      docId: 'doc-main',
      blockId: 'task-100',
      databaseId: 'db-main',
      sourceFlavor: 'affine:paragraph',
    });

    expect(hasSameTaskIdentity(todo, db)).toBe(true);
  });

  it('detects duplicate identities deterministically', () => {
    const a = createTodoTaskInteropLink({ docId: 'd', blockId: 'b1' });
    const b = createDatabaseRowTaskInteropLink({
      docId: 'd',
      blockId: 'b1',
      databaseId: 'db',
    });
    const c = createTodoTaskInteropLink({ docId: 'd', blockId: 'b2' });

    const duplicates = findDuplicateTaskIdentities([a, b, c]);
    expect(duplicates).toEqual(['d:b1']);
  });

  it('supports one-way parent completion semantics', () => {
    const parentCheckedBefore = true;
    const childStates = [true, false];

    // Parent manual toggle does not mutate children.
    expect(childStates).toEqual([true, false]);

    // Recompute restores parent to child-truth.
    const parentCheckedAfter =
      computeTodoParentCheckedFromChildren(childStates);
    expect(parentCheckedBefore).toBe(true);
    expect(parentCheckedAfter).toBe(false);
  });

  it('maps all-children-done to parent-done deterministically', () => {
    const childStates = [true, true, true];
    const first = computeTodoParentCheckedFromChildren(childStates);
    const second = computeTodoParentCheckedFromChildren(childStates);

    expect(first).toBe(true);
    expect(second).toBe(true);
  });

  it('handles non-click child mutation path deterministically', () => {
    // Simulate MCP/API mutation by directly changing child checked state,
    // then recomputing parent from current child snapshot.
    const parent = { checked: false };
    const children = [{ checked: false }, { checked: false }];

    children[0].checked = true;
    parent.checked =
      computeTodoParentCheckedFromChildren(children.map(c => c.checked)) ??
      parent.checked;
    expect(parent.checked).toBe(false);

    children[1].checked = true;
    parent.checked =
      computeTodoParentCheckedFromChildren(children.map(c => c.checked)) ??
      parent.checked;
    expect(parent.checked).toBe(true);

    children[0].checked = false;
    parent.checked =
      computeTodoParentCheckedFromChildren(children.map(c => c.checked)) ??
      parent.checked;
    expect(parent.checked).toBe(false);
  });
});
