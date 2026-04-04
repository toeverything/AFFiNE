import { NoteDisplayMode } from '@blocksuite/affine-model';
import { describe, expect, test, vi } from 'vitest';

import {
  collectPageTodoRows,
  createNestingIndicators,
  insertTodoSummaryBlock,
} from '../utils.js';

const text = (value: string) => ({
  toString: () => value,
});

const block = (
  id: string,
  flavour: string,
  props: Record<string, unknown> = {},
  children: any[] = []
) =>
  ({
    id,
    flavour,
    props,
    children,
  }) as any;

describe('todo summary utils', () => {
  test('creates one nesting indicator per level', () => {
    expect(createNestingIndicators(0)).toEqual([]);
    expect(createNestingIndicators(2)).toEqual([0, 1]);
  });

  test('collects page todos in page order across visible notes', () => {
    const deepNestedTodo = block(
      'todo-1-1-1',
      'affine:list',
      {
        type: 'todo',
        checked: false,
        text: text('Deep nested todo'),
      },
      []
    );
    const nestedTodo = block(
      'todo-1-1',
      'affine:list',
      {
        type: 'todo',
        checked: true,
        text: text('Nested todo'),
      },
      [deepNestedTodo]
    );
    const firstTodo = block(
      'todo-1',
      'affine:list',
      {
        type: 'todo',
        checked: false,
        text: text('First todo'),
      },
      [nestedTodo]
    );
    const secondTodo = block('todo-2', 'affine:list', {
      type: 'todo',
      checked: false,
      text: text('Second todo'),
    });
    const embeddedTodo = block('todo-embedded', 'affine:list', {
      type: 'todo',
      checked: false,
      text: text('Embedded todo'),
    });
    const hiddenTodo = block('todo-hidden', 'affine:list', {
      type: 'todo',
      checked: false,
      text: text('Hidden todo'),
    });
    const root = block('root', 'affine:page', {}, [
      block(
        'note-1',
        'affine:note',
        {
          displayMode: NoteDisplayMode.DocAndEdgeless,
        },
        [
          block('paragraph-1', 'affine:paragraph'),
          firstTodo,
          block('embed', 'affine:embed-linked-doc', {}, [embeddedTodo]),
        ]
      ),
      block(
        'note-2',
        'affine:note',
        {
          displayMode: NoteDisplayMode.DocOnly,
        },
        [secondTodo]
      ),
      block(
        'note-3',
        'affine:note',
        {
          displayMode: NoteDisplayMode.EdgelessOnly,
        },
        [hiddenTodo]
      ),
    ]);

    expect(collectPageTodoRows(root)).toEqual([
      {
        todoId: 'todo-1',
        text: 'First todo',
        checked: false,
        nestingLevel: 0,
      },
      {
        todoId: 'todo-1-1',
        text: 'Nested todo',
        checked: true,
        nestingLevel: 1,
      },
      {
        todoId: 'todo-1-1-1',
        text: 'Deep nested todo',
        checked: false,
        nestingLevel: 2,
      },
      {
        todoId: 'todo-2',
        text: 'Second todo',
        checked: false,
        nestingLevel: 0,
      },
    ]);
  });

  test('inserts todo summary block after current block', () => {
    const parent = {
      children: [],
    } as any;
    const model = {
      id: 'paragraph-1',
      text: {
        length: 0,
      },
      store: {
        getParent: vi.fn(() => parent),
        addBlock: vi.fn(() => 'summary-1'),
        deleteBlock: vi.fn(),
      },
    } as any;
    parent.children.push(model);

    insertTodoSummaryBlock(model);

    expect(model.store.addBlock).toHaveBeenCalledWith(
      'affine:todo-summary',
      {},
      parent,
      1
    );
    expect(model.store.deleteBlock).toHaveBeenCalledWith(model);
  });
});
