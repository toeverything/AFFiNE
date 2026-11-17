import { describe, expect, it } from 'vitest';

import {
  computeTodoParentCheckedFromChildModels,
  computeTodoParentCheckedFromChildren,
  createDatabaseRowTaskInteropLink,
  createTaskIdentity,
  createTodoCheckedTransitionTracker,
  createTodoTaskInteropLink,
  encodeTaskAncestorIdentities,
  encodeTaskAncestorIdentityToken,
  hasSameTaskIdentity,
  parseTaskIdentity,
  TASK_INTEROP_UPDATED_EVENT,
} from '../../utils/task-interop.js';

describe('task interop identity', () => {
  it('creates identity from doc and block', () => {
    expect(createTaskIdentity({ docId: 'd1', blockId: 'b1' })).toBe('d1:b1');
  });

  it('creates identity with space prefix', () => {
    expect(
      createTaskIdentity({ spaceId: 's1', docId: 'd1', blockId: 'b1' })
    ).toBe('s1:d1:b1');
  });

  it('parses 2-part identity', () => {
    expect(parseTaskIdentity('d1:b1')).toEqual({
      spaceId: undefined,
      docId: 'd1',
      blockId: 'b1',
    });
  });

  it('parses 3-part identity', () => {
    expect(parseTaskIdentity('s1:d1:b1')).toEqual({
      spaceId: 's1',
      docId: 'd1',
      blockId: 'b1',
    });
  });

  it('returns null for invalid identity', () => {
    expect(parseTaskIdentity('a:b:c:d')).toBeNull();
  });

  it('encodes and decodes separators safely', () => {
    const identity = createTaskIdentity({
      spaceId: 'space:1',
      docId: 'doc:2',
      blockId: 'block:3',
    });
    expect(identity).not.toBe('space:1:doc:2:block:3');
    expect(parseTaskIdentity(identity)).toEqual({
      spaceId: 'space:1',
      docId: 'doc:2',
      blockId: 'block:3',
    });
  });

  it('encodes ancestor identities with strong token boundaries', () => {
    const encoded = encodeTaskAncestorIdentities(['doc:a', 'doc:ab']);

    expect(encoded).toBe('|doc:a|doc:ab|');
    expect(encoded.includes(encodeTaskAncestorIdentityToken('doc:a'))).toBe(
      true
    );
    expect(encoded.includes(encodeTaskAncestorIdentityToken('doc:ab'))).toBe(
      true
    );
    expect(encoded.includes(encodeTaskAncestorIdentityToken('doc:b'))).toBe(
      false
    );
  });
});

describe('task interop links', () => {
  it('creates todo link with stable identity', () => {
    const link = createTodoTaskInteropLink({
      docId: 'doc',
      blockId: 'todo',
      title: 'Sprint',
      cost: 42,
    });
    expect(link.taskIdentity).toBe('doc:todo');
    expect(link.sourceFlavor).toBe('affine:list');
    expect(link.title).toBe('Sprint');
    expect(link.cost).toBe(42);
  });

  it('creates database row link with row id mapping', () => {
    const link = createDatabaseRowTaskInteropLink({
      docId: 'doc',
      blockId: 'row-1',
      databaseId: 'db-1',
    });
    expect(link.databaseRowId).toBe('row-1');
    expect(link.databaseId).toBe('db-1');
  });

  it('compares task identity across surfaces', () => {
    const todo = createTodoTaskInteropLink({
      docId: 'doc',
      blockId: 'b1',
      databaseId: 'db-1',
      databaseRowId: 'row-1',
    });
    const db = createDatabaseRowTaskInteropLink({
      docId: 'doc',
      blockId: 'b1',
      databaseId: 'db-1',
    });
    expect(hasSameTaskIdentity(todo, db)).toBe(true);
  });

  it('exports a stable event name', () => {
    expect(TASK_INTEROP_UPDATED_EVENT).toBe('affine:task-interop-updated');
  });
});

describe('nested completion recompute', () => {
  it('returns null for empty child list', () => {
    expect(computeTodoParentCheckedFromChildren([])).toBeNull();
  });

  it('returns true only when all children are checked', () => {
    expect(computeTodoParentCheckedFromChildren([true, true])).toBe(true);
    expect(computeTodoParentCheckedFromChildren([true, false])).toBe(false);
    expect(computeTodoParentCheckedFromChildren([false, false])).toBe(false);
  });

  it('is idempotent for the same child snapshot', () => {
    const snapshot = [true, false, true];
    const once = computeTodoParentCheckedFromChildren(snapshot);
    const twice = computeTodoParentCheckedFromChildren(snapshot);
    expect(twice).toBe(once);
  });

  it('supports overriding changed child state in same tick', () => {
    const children = [
      { id: 'c1', checked: true },
      { id: 'c2', checked: false },
    ];

    expect(
      computeTodoParentCheckedFromChildModels(children, {
        id: 'c2',
        checked: true,
      })
    ).toBe(true);

    expect(
      computeTodoParentCheckedFromChildModels(children, {
        id: 'c1',
        checked: false,
      })
    ).toBe(false);
  });
});

describe('todo checked transition tracker', () => {
  it('ignores initial todo snapshot and only triggers on transitions', () => {
    const tracker = createTodoCheckedTransitionTracker();

    expect(tracker.shouldRecompute('todo', false)).toBe(false);
    expect(tracker.shouldRecompute('todo', false)).toBe(false);
    expect(tracker.shouldRecompute('todo', true)).toBe(true);
    expect(tracker.shouldRecompute('todo', true)).toBe(false);
    expect(tracker.shouldRecompute('todo', false)).toBe(true);
  });

  it('resets initialization when block is not todo', () => {
    const tracker = createTodoCheckedTransitionTracker();

    expect(tracker.shouldRecompute('todo', false)).toBe(false);
    expect(tracker.shouldRecompute('todo', true)).toBe(true);
    expect(tracker.shouldRecompute('bulleted', true)).toBe(false);
    expect(tracker.shouldRecompute('todo', true)).toBe(false);
    expect(tracker.shouldRecompute('todo', false)).toBe(true);
  });

  it('covers non-click mutation style sequence', () => {
    const tracker = createTodoCheckedTransitionTracker();

    // Initial mount snapshot.
    expect(tracker.shouldRecompute('todo', false)).toBe(false);
    // External API/MCP mutation applies checked=true.
    expect(tracker.shouldRecompute('todo', true)).toBe(true);
    // Duplicate event with same value should not recompute.
    expect(tracker.shouldRecompute('todo', true)).toBe(false);
    // External mutation reverts checked.
    expect(tracker.shouldRecompute('todo', false)).toBe(true);
  });
});
