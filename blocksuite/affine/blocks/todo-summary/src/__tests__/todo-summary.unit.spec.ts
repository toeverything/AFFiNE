import { NoteDisplayMode } from '@blocksuite/affine-model';
import { render } from 'lit';
import { describe, expect, test, vi } from 'vitest';

import { TodoSummaryBlockComponent } from '../todo-summary-block.js';
import {
  collectPageTodoRows,
  createNestingIndicators,
  filterTodoRows,
  getTodoSummaryAvailableTags,
  getTodoSummaryTagCounts,
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

const createTodoSummaryComponent = () => {
  const component = Object.create(TodoSummaryBlockComponent.prototype) as any;
  Object.defineProperty(component, 'store', {
    value: { readonly: false },
    configurable: true,
  });
  Object.defineProperty(component, 'renderRoot', {
    value: {
      querySelector: (selector: string) =>
        selector === '.tags-filter' ? (component._tagsFilter ?? null) : null,
    },
    configurable: true,
  });
  Object.defineProperty(component, '_tagSearchQuery', {
    value: '',
    writable: true,
    configurable: true,
  });
  Object.defineProperty(component, '_searchQuery', {
    value: '',
    writable: true,
    configurable: true,
  });

  return component;
};

describe('todo summary utils', () => {
  test('keeps the filter inputs aligned to the right side of the filter bar', () => {
    expect(
      (TodoSummaryBlockComponent.styles as { cssText: string }).cssText
    ).toContain('margin-left: auto');
  });

  test('styles the tag summary like a visible input control', () => {
    const cssText = (TodoSummaryBlockComponent.styles as { cssText: string })
      .cssText;

    expect(cssText).toContain('.filter-inputs');
    expect(cssText).toContain(
      'background: var(--affine-background-secondary-color);'
    );
    expect(cssText).toContain('border: 1px solid var(--affine-border-color);');
  });

  test('does not show a default tag value when no tags are selected', () => {
    const component = createTodoSummaryComponent();
    const container = document.createElement('div');

    render(
      component._renderFilters(['work'], { work: 1 }, [], 'all'),
      container
    );

    expect(container.textContent).not.toContain('Any');
    expect(container.querySelector('.tags-clear')).toBeNull();
  });

  test('shows a clear button when tags are selected', () => {
    const component = createTodoSummaryComponent();
    const container = document.createElement('div');

    render(
      component._renderFilters(
        ['urgent', 'work'],
        { urgent: 1, work: 1 },
        ['work'],
        'all'
      ),
      container
    );

    expect(container.querySelector('.tags-clear')).not.toBeNull();
  });

  test('closes the tag dropdown when clicking outside the component', () => {
    const component = createTodoSummaryComponent();
    component._tagsFilter = { open: true };

    component._handleDocumentPointerDown({
      composedPath: () => [],
    } as unknown as PointerEvent);

    expect(component._tagsFilter.open).toBe(false);
  });

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
        text: text('Deep nested todo #urgent'),
      },
      []
    );
    const nestedTodo = block(
      'todo-1-1',
      'affine:list',
      {
        type: 'todo',
        checked: true,
        text: text('Nested todo #work'),
      },
      [deepNestedTodo]
    );
    const firstTodo = block(
      'todo-1',
      'affine:list',
      {
        type: 'todo',
        checked: false,
        text: text('First todo #work #urgent'),
      },
      [nestedTodo]
    );
    const secondTodo = block('todo-2', 'affine:list', {
      type: 'todo',
      checked: false,
      text: text('Second todo #later'),
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
        text: 'First todo #work #urgent',
        checked: false,
        nestingLevel: 0,
        tags: ['work', 'urgent'],
      },
      {
        todoId: 'todo-1-1',
        text: 'Nested todo #work',
        checked: true,
        nestingLevel: 1,
        tags: ['work'],
      },
      {
        todoId: 'todo-1-1-1',
        text: 'Deep nested todo #urgent',
        checked: false,
        nestingLevel: 2,
        tags: ['urgent'],
      },
      {
        todoId: 'todo-2',
        text: 'Second todo #later',
        checked: false,
        nestingLevel: 0,
        tags: ['later'],
      },
    ]);
  });

  test('collects available tags in sorted order', () => {
    expect(
      getTodoSummaryAvailableTags([
        {
          todoId: 'todo-1',
          text: 'First todo',
          checked: false,
          nestingLevel: 0,
          tags: ['work', 'urgent'],
        },
        {
          todoId: 'todo-2',
          text: 'Second todo',
          checked: true,
          nestingLevel: 0,
          tags: ['later', 'urgent'],
        },
      ])
    ).toEqual(['later', 'urgent', 'work']);
  });

  test('counts tags in the current filtered list', () => {
    expect(
      getTodoSummaryTagCounts([
        {
          todoId: 'todo-1',
          text: 'First todo',
          checked: false,
          nestingLevel: 0,
          tags: ['work', 'urgent'],
        },
        {
          todoId: 'todo-2',
          text: 'Second todo',
          checked: true,
          nestingLevel: 0,
          tags: ['urgent'],
        },
        {
          todoId: 'todo-3',
          text: 'Third todo',
          checked: false,
          nestingLevel: 0,
          tags: ['work'],
        },
      ])
    ).toEqual({
      urgent: 2,
      work: 2,
    });
  });

  test('filters rows by status, tags, and search text', () => {
    const rows = [
      {
        todoId: 'todo-1',
        text: 'Ship landing page',
        checked: false,
        nestingLevel: 0,
        tags: ['work', 'urgent'],
      },
      {
        todoId: 'todo-2',
        text: 'Archive receipts',
        checked: true,
        nestingLevel: 0,
        tags: ['home', 'urgent'],
      },
      {
        todoId: 'todo-3',
        text: 'Write docs',
        checked: false,
        nestingLevel: 0,
        tags: ['work'],
      },
    ];

    expect(
      filterTodoRows(rows, {
        statusFilter: 'done',
        searchQuery: '',
        selectedTags: [],
      }).map(row => row.todoId)
    ).toEqual(['todo-2']);

    expect(
      filterTodoRows(rows, {
        statusFilter: 'all',
        searchQuery: '',
        selectedTags: ['work', 'urgent'],
      }).map(row => row.todoId)
    ).toEqual(['todo-1']);

    expect(
      filterTodoRows(rows, {
        statusFilter: 'not-done',
        searchQuery: 'DOCS',
        selectedTags: [],
      }).map(row => row.todoId)
    ).toEqual(['todo-3']);
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
