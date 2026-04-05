# Todo Summary Comment Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a comment icon to each todo-summary row that opens only that todo's threads, or starts a new thread when none exist.

**Architecture:** Extend the comment sidebar display mode with a `subset` branch for multiple comment ids. Extend todo-summary row data with merged block and inline comment ids, then wire the row action through the existing comment provider so the block stays decoupled from frontend services.

**Tech Stack:** Lit, Vitest, BlockSuite block services, AFFiNE comment sidebar services

---

### Task 1: Add subset comment-sidebar mode

**Files:**

- Modify: `packages/frontend/core/src/modules/comment/services/comment-panel-service.ts`
- Modify: `packages/frontend/core/src/components/comment/sidebar/utils.ts`
- Test: `packages/frontend/core/src/components/comment/sidebar/utils.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test('shows only matching comments when sidebar is in subset mode', () => {
  const comments = [createComment({ id: 'comment-1', createdAt: 10 }), createComment({ id: 'comment-2', createdAt: 20, resolved: true }), createComment({ id: 'comment-3', createdAt: 30 })];

  const result = getVisibleComments({
    comments,
    displayMode: {
      type: 'subset',
      commentIds: ['comment-1', 'comment-3'],
    },
    filterState: defaultFilterState,
    docMode: 'page',
  });

  expect(result.map(comment => comment.id)).toEqual(['comment-3', 'comment-1']);
});

test('shows empty list when subset ids are stale', () => {
  const result = getVisibleComments({
    comments: [createComment({ id: 'comment-1' })],
    displayMode: {
      type: 'subset',
      commentIds: ['missing'],
    },
    filterState: defaultFilterState,
    docMode: 'page',
  });

  expect(result).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest --run packages/frontend/core/src/components/comment/sidebar/utils.spec.ts`
Expected: FAIL because `subset` is not a valid display mode and filtering does not handle it.

- [ ] **Step 3: Write minimal implementation**

```ts
export type CommentPanelDisplayMode = { type: 'all' } | { type: 'focused'; commentId: string } | { type: 'subset'; commentIds: string[] };
```

```ts
if (displayMode.type === 'subset') {
  const visibleIds = new Set(displayMode.commentIds);
  return comments.filter(comment => visibleIds.has(comment.id)).toSorted((a, b) => b.createdAt - a.createdAt);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest --run packages/frontend/core/src/components/comment/sidebar/utils.spec.ts`
Expected: PASS

### Task 2: Add provider support for opening multiple threads

**Files:**

- Modify: `blocksuite/affine/shared/src/services/comment-service/comment-provider.ts`
- Modify: `packages/frontend/core/src/blocksuite/view-extensions/comment/comment-provider.ts`

- [ ] **Step 1: Write the failing test shape in the consumer first**

Use the todo-summary tests from Task 4 to force this API. The target call shape is:

```ts
commentProvider.showComments(['comment-1', 'comment-2']);
```

- [ ] **Step 2: Run the targeted todo-summary test to verify it fails**

Run: `yarn vitest --run blocksuite/affine/blocks/todo-summary/src/__tests__/todo-summary.unit.spec.ts`
Expected: FAIL because `showComments` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface CommentProvider {
  addComment: (selections: BaseSelection[]) => void;
  resolveComment: (id: CommentId) => void;
  highlightComment: (id: CommentId | null) => void;
  showComments: (commentIds: CommentId[]) => void;
  // ...
}
```

```ts
  showComments(commentIds: string[]): void {
    if (commentIds.length === 0) return;

    const commentPanelService = this.framework.get(CommentPanelService);

    if (commentIds.length === 1) {
      commentPanelService.openCommentPanel({
        focusedCommentId: commentIds[0],
      });
      this.commentEntity.highlightComment(commentIds[0]);
      return;
    }

    commentPanelService.openCommentPanel({
      subsetCommentIds: commentIds,
    });
    this.commentEntity.highlightComment(null);
  }
```

- [ ] **Step 4: Re-run the future consumer test**

Run: `yarn vitest --run blocksuite/affine/blocks/todo-summary/src/__tests__/todo-summary.unit.spec.ts`
Expected: still FAIL, but now because todo-summary has not been wired yet.

### Task 3: Collect comment ids for todo-summary rows

**Files:**

- Modify: `blocksuite/affine/blocks/todo-summary/src/utils.ts`
- Test: `blocksuite/affine/blocks/todo-summary/src/__tests__/todo-summary.unit.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test('collects merged block and inline comment ids for todo rows', () => {
  const root = block('root', 'affine:page', {}, [
    block('note-1', 'affine:note', { displayMode: NoteDisplayMode.DocOnly }, [
      block('todo-1', 'affine:list', {
        type: 'todo',
        checked: false,
        comments: { 'comment-1': true },
        text: {
          toString: () => 'First todo',
          toDelta: () => [{ insert: 'First ' }, { insert: 'todo', attributes: { 'comment-comment-2': true } }],
        },
      }),
    ]),
  ]);

  expect(collectPageTodoRows(root)[0]?.commentIds).toEqual(['comment-1', 'comment-2']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest --run blocksuite/affine/blocks/todo-summary/src/__tests__/todo-summary.unit.spec.ts`
Expected: FAIL because rows do not expose `commentIds`.

- [ ] **Step 3: Write minimal implementation**

```ts
export type TodoSummaryRow = {
  todoId: string;
  text: string;
  checked: boolean;
  nestingLevel: number;
  tags: string[];
  commentIds: string[];
};
```

```ts
function getTodoCommentIds(block: BlockModel) {
  const blockCommentIds = 'comments' in block.props && block.props.comments ? Object.keys(block.props.comments) : [];

  const inlineCommentIds =
    block.text?.toDelta().flatMap(delta =>
      Object.keys(delta.attributes ?? {})
        .filter(key => key.startsWith('comment-'))
        .map(key => key.replace('comment-', ''))
    ) ?? [];

  return Array.from(new Set([...blockCommentIds, ...inlineCommentIds])).sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest --run blocksuite/affine/blocks/todo-summary/src/__tests__/todo-summary.unit.spec.ts`
Expected: PASS for the new collection test

### Task 4: Add todo-summary comment icon behavior

**Files:**

- Modify: `blocksuite/affine/blocks/todo-summary/src/todo-summary-block.ts`
- Test: `blocksuite/affine/blocks/todo-summary/src/__tests__/todo-summary.unit.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
test('opens matching comment threads when todo row has comments', () => {
  const component = createTodoSummaryComponent();
  const showComments = vi.fn();
  component.std = {
    getOptional: vi.fn(() => ({ showComments, addComment: vi.fn() })),
  };

  component._handleCommentClick(
    {
      todoId: 'todo-1',
      text: 'Todo',
      checked: false,
      nestingLevel: 0,
      tags: [],
      commentIds: ['comment-1', 'comment-2'],
    },
    new MouseEvent('click')
  );

  expect(showComments).toHaveBeenCalledWith(['comment-1', 'comment-2']);
});

test('starts a new thread when todo row has no comments', () => {
  const component = createTodoSummaryComponent();
  const addComment = vi.fn();
  component.std = {
    getOptional: vi.fn(() => ({ showComments: vi.fn(), addComment })),
  };

  component._handleCommentClick(
    {
      todoId: 'todo-1',
      text: 'Todo',
      checked: false,
      nestingLevel: 0,
      tags: [],
      commentIds: [],
    },
    new MouseEvent('click')
  );

  expect(addComment).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn vitest --run blocksuite/affine/blocks/todo-summary/src/__tests__/todo-summary.unit.spec.ts`
Expected: FAIL because the click handler and icon do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
private _handleCommentClick(row: TodoSummaryRow, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();

  const commentProvider = this.std.getOptional(CommentProviderIdentifier);
  if (!commentProvider) return;

  if (row.commentIds.length > 0) {
    commentProvider.showComments(row.commentIds);
    return;
  }

  commentProvider.addComment([
    new BlockSelection({
      blockId: row.todoId,
    }),
  ]);
}
```

```ts
<td>
  <button
    class="comment-button"
    aria-label=${row.commentIds.length > 0 ? 'Show todo comments' : 'Add todo comment'}
    @click=${(event: MouseEvent) => this._handleCommentClick(row, event)}
  >
    ${CommentIcon()}
  </button>
</td>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn vitest --run blocksuite/affine/blocks/todo-summary/src/__tests__/todo-summary.unit.spec.ts`
Expected: PASS

### Task 5: Final targeted verification

**Files:**

- Test: `packages/frontend/core/src/components/comment/sidebar/utils.spec.ts`
- Test: `blocksuite/affine/blocks/todo-summary/src/__tests__/todo-summary.unit.spec.ts`

- [ ] **Step 1: Run the frontend sidebar tests**

Run: `yarn vitest --run packages/frontend/core/src/components/comment/sidebar/utils.spec.ts`
Expected: PASS

- [ ] **Step 2: Run the todo-summary tests**

Run: `yarn vitest --run blocksuite/affine/blocks/todo-summary/src/__tests__/todo-summary.unit.spec.ts`
Expected: PASS

- [ ] **Step 3: Run both files together**

Run: `yarn vitest --run packages/frontend/core/src/components/comment/sidebar/utils.spec.ts blocksuite/affine/blocks/todo-summary/src/__tests__/todo-summary.unit.spec.ts`
Expected: PASS
