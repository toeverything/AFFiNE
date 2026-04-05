# Todo-Summary Comment Action Design

Date: 2026-04-05
Status: Approved for planning

## Summary

Add a comment action at the right side of every todo row in the todo-summary block.

Click behavior:

- if the source todo already has comment threads, open the comment sidebar filtered to that todo's threads only
- if the source todo has no comment threads, start a new thread on that todo

This extends the existing single-thread focus behavior to support a subset of multiple threads for one todo.

## Goals

- Show a comment action on every todo-summary row.
- Open only the matched todo threads when comments already exist.
- Start a new todo comment when none exist.
- Reuse existing comment sidebar and pending-comment flows.

## Non-goals

- Changing comment storage schema.
- Changing how normal editor comments are created.
- Adding comment counts, unread badges, or hover-only affordances.
- Supporting arbitrary multi-block filtering outside todo-summary.

## User-visible Behavior

### Row action

Each todo row renders a comment icon at the far right.

- row click still jumps to the source todo
- comment icon click does not trigger row jump

### Existing-thread behavior

If the source todo has one or more comment threads, clicking the comment icon:

- opens the comment sidebar
- filters the sidebar to only the threads attached to that todo
- shows all matching threads, not just one

### No-thread behavior

If the source todo has no comment thread, clicking the comment icon:

- opens the comment sidebar
- starts a new pending comment for that todo block

## Thread Matching Rule

A todo is considered to have comment threads when either of these are true:

- the todo block has block-level comment ids in `props.comments`
- the todo text contains inline comment ids in its text delta attributes

The todo-summary action should use the union of both sources.

This avoids false negatives when a user commented on selected text inside the todo instead of attaching a block comment.

## Technical Design

### Todo-summary row model

Extend `TodoSummaryRow` with:

- `commentIds: string[]`

`collectPageTodoRows` will gather comment ids from the todo block model when building rows.

### Comment sidebar display mode

Extend comment-panel display mode from:

- `all`
- `focused(commentId)`

to:

- `all`
- `focused(commentId)`
- `subset(commentIds[])`

`subset` means:

- only comments whose ids are in the provided set are shown
- comments remain sorted by existing sidebar order
- other sidebar comments are hidden

### Comment provider bridge

Extend the editor comment provider with a method for opening multiple threads, for example:

- `showComments(commentIds: string[])`

Behavior:

- empty array: no-op
- one id: may reuse existing focused flow
- multiple ids: open sidebar in `subset` mode

This keeps todo-summary decoupled from frontend-only sidebar service details.

### Todo-summary click handling

Comment icon handler:

1. stop row click propagation
2. inspect `row.commentIds`
3. if non-empty, call provider multi-thread open method
4. if empty, call existing provider `addComment` with a `BlockSelection` for the todo block

### Sidebar filtering logic

Update visible-comment selection logic:

- `focused`: keep current single-comment behavior
- `subset`: return only comments whose ids are in the subset
- `all`: keep current filter behavior

`subset` should not widen back to unrelated comments because of other filter toggles.

## Error Handling

- If no comment provider exists, the icon click is a no-op.
- If a todo block no longer exists, new-thread creation is a no-op.
- If a subset id no longer exists in fetched comments, ignore that id.
- If all subset ids are stale, show an empty sidebar state instead of falling back to all comments.

## Testing Strategy

Write tests before implementation.

### Todo-summary tests

1. row data includes block-level comment ids
2. row data includes inline text comment ids
3. row data de-duplicates merged comment ids
4. comment icon click with ids does not trigger row jump
5. comment icon click with no ids starts a new block comment

### Comment sidebar tests

1. `focused` mode still returns one comment
2. `subset` mode returns only matching comments
3. `subset` mode ignores unrelated comments
4. existing `all` mode behavior remains unchanged

## Risks

- Real complexity increase is the new sidebar display mode. It is small but cross-layer.
- If todo-summary only checks block comments, inline-text comments would be missed.
- If icon clicks bubble, the UI will jump to the todo while opening comments, which is wrong.

## Implementation Outline

1. Add comment-id collection helpers for todo rows.
2. Add todo row comment action UI and click handlers.
3. Extend comment provider with multi-thread open support.
4. Extend comment-panel display mode with `subset`.
5. Update sidebar filtering tests.
