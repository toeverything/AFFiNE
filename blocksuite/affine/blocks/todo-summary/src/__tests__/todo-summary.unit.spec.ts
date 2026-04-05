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

const text = (value: string, delta?: Array<Record<string, unknown>>) => ({
  toString: () => value,
  toDelta: () => delta ?? [{ insert: value }],
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

  test('allows long todo text to wrap', () => {
    const cssText = (TodoSummaryBlockComponent.styles as { cssText: string })
      .cssText;
    const todoTextRule = cssText.match(/\.todo-text\s*\{([^}]*)\}/)?.[1];
    const todoValueRule = cssText.match(/\.todo-value\s*\{([^}]*)\}/)?.[1];

    expect(todoTextRule).toContain('align-items: flex-start;');
    expect(todoValueRule).toContain('min-width: 0;');
    expect(todoValueRule).toContain('white-space: normal;');
    expect(todoValueRule).toContain('overflow-wrap: anywhere;');
    expect(todoValueRule).not.toContain('text-overflow: ellipsis;');
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

  test('renders different comment button states for commented and uncommented todos', () => {
    const component = createTodoSummaryComponent();
    const container = document.createElement('div');
    const root = block('root', 'affine:page', {}, [
      block(
        'note-1',
        'affine:note',
        {
          displayMode: NoteDisplayMode.DocOnly,
        },
        [
          block('todo-1', 'affine:list', {
            type: 'todo',
            checked: false,
            comments: { 'comment-1': true },
            text: text('Todo with comments'),
          }),
          block('todo-2', 'affine:list', {
            type: 'todo',
            checked: false,
            text: text('Todo without comments'),
          }),
        ]
      ),
    ]);

    Object.defineProperty(component, 'store', {
      value: { readonly: false, root },
      configurable: true,
    });
    Object.defineProperty(component, 'model', {
      value: {
        props: {
          statusFilter: 'all',
          tagsFilter: [],
        },
      },
      configurable: true,
    });

    render(component.renderBlock(), container);

    const buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.comment-button')
    );

    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.dataset.hasComments).toBe('true');
    expect(buttons[0]?.classList.contains('has-comments')).toBe(true);
    expect(buttons[1]?.dataset.hasComments).toBe('false');
    expect(buttons[1]?.classList.contains('has-comments')).toBe(false);
  });

  test('renders the closest heading above the todo text', () => {
    const component = createTodoSummaryComponent();
    const container = document.createElement('div');
    const root = block('root', 'affine:page', {}, [
      block(
        'note-1',
        'affine:note',
        {
          displayMode: NoteDisplayMode.DocOnly,
        },
        [
          block('heading-1', 'affine:paragraph', {
            type: 'h2',
            text: text('Current section'),
          }),
          block('todo-1', 'affine:list', {
            type: 'todo',
            checked: false,
            text: text('Todo with heading'),
          }),
        ]
      ),
    ]);

    Object.defineProperty(component, 'store', {
      value: { readonly: false, root },
      configurable: true,
    });
    Object.defineProperty(component, 'model', {
      value: {
        props: {
          statusFilter: 'all',
          tagsFilter: [],
        },
      },
      configurable: true,
    });

    render(component.renderBlock(), container);

    expect(container.querySelector('.todo-heading')?.textContent?.trim()).toBe(
      'H2 Current section'
    );
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
        commentIds: [],
      },
      {
        todoId: 'todo-1-1',
        text: 'Nested todo #work',
        checked: true,
        nestingLevel: 1,
        tags: ['work'],
        commentIds: [],
      },
      {
        todoId: 'todo-1-1-1',
        text: 'Deep nested todo #urgent',
        checked: false,
        nestingLevel: 2,
        tags: ['urgent'],
        commentIds: [],
      },
      {
        todoId: 'todo-2',
        text: 'Second todo #later',
        checked: false,
        nestingLevel: 0,
        tags: ['later'],
        commentIds: [],
      },
    ]);
  });

  test('collects merged block and inline comment ids for todo rows', () => {
    const root = block('root', 'affine:page', {}, [
      block(
        'note-1',
        'affine:note',
        {
          displayMode: NoteDisplayMode.DocOnly,
        },
        [
          block('todo-1', 'affine:list', {
            type: 'todo',
            checked: false,
            comments: { 'comment-1': true, 'comment-2': false },
            text: text('First todo', [
              { insert: 'First ' },
              {
                insert: 'todo',
                attributes: {
                  'comment-comment-2': true,
                  'comment-comment-3': true,
                },
              },
            ]),
          }),
        ]
      ),
    ]);

    expect(collectPageTodoRows(root)).toEqual([
      {
        todoId: 'todo-1',
        text: 'First todo',
        checked: false,
        nestingLevel: 0,
        tags: [],
        commentIds: ['comment-1', 'comment-2', 'comment-3'],
      },
    ]);
  });

  test('collects the closest previous heading for each todo', () => {
    const root = block('root', 'affine:page', {}, [
      block(
        'note-1',
        'affine:note',
        {
          displayMode: NoteDisplayMode.DocOnly,
        },
        [
          block('heading-1', 'affine:paragraph', {
            type: 'h1',
            text: text('Planning'),
          }),
          block('todo-1', 'affine:list', {
            type: 'todo',
            checked: false,
            text: text('Draft spec'),
          }),
          block('heading-2', 'affine:paragraph', {
            type: 'h3',
            text: text('Launch'),
          }),
          block('todo-2', 'affine:list', {
            type: 'todo',
            checked: false,
            text: text('Ship it'),
          }),
        ]
      ),
      block(
        'note-2',
        'affine:note',
        {
          displayMode: NoteDisplayMode.DocOnly,
        },
        [
          block('todo-3', 'affine:list', {
            type: 'todo',
            checked: false,
            text: text('No heading here'),
          }),
        ]
      ),
    ]);

    expect(collectPageTodoRows(root)).toEqual([
      {
        todoId: 'todo-1',
        text: 'Draft spec',
        checked: false,
        nestingLevel: 0,
        tags: [],
        commentIds: [],
        heading: {
          level: 1,
          text: 'Planning',
        },
      },
      {
        todoId: 'todo-2',
        text: 'Ship it',
        checked: false,
        nestingLevel: 0,
        tags: [],
        commentIds: [],
        heading: {
          level: 3,
          text: 'Launch',
        },
      },
      {
        todoId: 'todo-3',
        text: 'No heading here',
        checked: false,
        nestingLevel: 0,
        tags: [],
        commentIds: [],
      },
    ]);
  });

  test('opens matching comment threads when todo row has comments', () => {
    const component = createTodoSummaryComponent();
    const showComments = vi.fn();
    const addComment = vi.fn();
    const event = {
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as MouseEvent;

    Object.defineProperty(component, 'std', {
      value: {
        getOptional: vi.fn(() => ({
          showComments,
          addComment,
        })),
      },
      configurable: true,
    });

    component._handleCommentClick(
      {
        todoId: 'todo-1',
        text: 'Todo',
        checked: false,
        nestingLevel: 0,
        tags: [],
        commentIds: ['comment-1', 'comment-2'],
      },
      event
    );

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(showComments).toHaveBeenCalledWith(['comment-1', 'comment-2']);
    expect(addComment).not.toHaveBeenCalled();
  });

  test('starts a new thread when todo row has no comments', () => {
    const component = createTodoSummaryComponent();
    const showComments = vi.fn();
    const addComment = vi.fn();

    Object.defineProperty(component, 'std', {
      value: {
        getOptional: vi.fn(() => ({
          showComments,
          addComment,
        })),
      },
      configurable: true,
    });

    component._handleCommentClick(
      {
        todoId: 'todo-1',
        text: 'Todo',
        checked: false,
        nestingLevel: 0,
        tags: [],
        commentIds: [],
      },
      {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      } as unknown as MouseEvent
    );

    expect(showComments).not.toHaveBeenCalled();
    expect(addComment).toHaveBeenCalledTimes(1);
    expect(addComment.mock.calls[0][0][0].from).toEqual({
      blockId: 'todo-1',
      index: 0,
      length: 4,
    });
    expect(addComment.mock.calls[0][0][0].to).toBeNull();
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
          commentIds: [],
        },
        {
          todoId: 'todo-2',
          text: 'Second todo',
          checked: true,
          nestingLevel: 0,
          tags: ['later', 'urgent'],
          commentIds: [],
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
          commentIds: [],
        },
        {
          todoId: 'todo-2',
          text: 'Second todo',
          checked: true,
          nestingLevel: 0,
          tags: ['urgent'],
          commentIds: [],
        },
        {
          todoId: 'todo-3',
          text: 'Third todo',
          checked: false,
          nestingLevel: 0,
          tags: ['work'],
          commentIds: [],
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
        commentIds: [],
      },
      {
        todoId: 'todo-2',
        text: 'Archive receipts',
        checked: true,
        nestingLevel: 0,
        tags: ['home', 'urgent'],
        commentIds: [],
      },
      {
        todoId: 'todo-3',
        text: 'Write docs',
        checked: false,
        nestingLevel: 0,
        tags: ['work'],
        commentIds: [],
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
