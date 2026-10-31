import type { BlockStdScope } from '@blocksuite/std';

/**
 * Structural (duck-typed) view of `DatabaseBlockDataSource`'s own Story
 * 2.6/2.7 task-workflow methods — `data-view` is a lower-level,
 * flavour-agnostic package and cannot import types from
 * `@blocksuite/affine-block-database` (which itself depends on
 * `data-view`), so every renderer that needs task-status/Note/Due-date
 * behavior is gated on structural capability instead: only a data source
 * that actually implements these methods (i.e. a todo-capable table) grows
 * the corresponding UI at all. Shared across the list, table, kanban, and
 * calendar view renderers so each doesn't redeclare its own overlapping
 * subset.
 */
export interface TaskWorkflowCapableDataSource {
  getTaskStatusColumn?: () => unknown;
  getTaskStatusInfo?: (rowId: string) => { checked: boolean } | null;
  getNoteRef?: (
    rowId: string
  ) => { refDocId: string; refBlockId: string } | undefined;
  // Returns an already-resolved, paintable CSS color for the *current*
  // theme — the row's stored value is a theme `Color` token (e.g.
  // `{dark, light}`), which `data-view` has no way to resolve itself
  // (that needs `resolveColor`/`ThemeProvider` from
  // `@blocksuite/affine-model`/`@blocksuite/affine-shared`, deliberately
  // not a `data-view` dependency) — so resolution happens on the data
  // source's own side (`DatabaseBlockDataSource.getResolvedNoteColor`),
  // called fresh on every render so a theme switch is reflected live.
  getResolvedNoteColor?: (
    std: BlockStdScope,
    rowId: string
  ) => string | undefined;
  createNoteForRow?: (std: BlockStdScope, rowId: string) => void;
  revealOrInsertNoteForRow?: (std: BlockStdScope, rowId: string) => void;
  attachExistingNoteForRow?: (
    std: BlockStdScope,
    rowId: string
  ) => Promise<void>;
  // Story 2.7: resolves the overdue-and-undone treatment for this row
  // (`null` if neither highlight nor hide applies) — computed on the data
  // source's own side for the same reason `getResolvedNoteColor` is: it
  // needs `JournalTodoDatabaseProvider`/date comparison logic `data-view`
  // deliberately doesn't depend on.
  getDueDateHighlightState?: (
    std: BlockStdScope,
    rowId: string
  ) => 'highlight' | 'hide' | null;
  // Story 2.7 (live-render fix): read fresh on every render, same as
  // `getDueDateHighlightState` above — see `getShowDueDateColumnSetting`'s
  // own doc comment in `data-source.ts` for why this needs a live check
  // in addition to (not instead of) the creation-time default.
  getShowDueDateColumnSetting?: (std: BlockStdScope) => boolean;
  // Story 2.7 (generic-path auto-seed): when a calendar view has no
  // explicit `date.startColumnId` of its own yet, `dateMapping$` falls
  // back to this column instead of surfacing `CalendarDateMapping`'s
  // `'setup'` state — so adding a Calendar view (via the database's own
  // normal view-switcher, no special insert command needed) to *any*
  // database that already has a Due date column (Task 0) just works, with
  // no setup step. A generic, non-todo database has no such method at
  // all, so it still falls through to `'setup'` as before.
  getDueDateColumn?: () => { id: string } | undefined;
  // Story 2.7 (Task 3): row-hover "set due date" button — reads/writes the
  // Due date cell directly, same duck-typed-delegate shape as the Note
  // methods above (the actual column/cell logic lives on
  // `DatabaseBlockDataSource`, not here).
  getDueDateForRow?: (rowId: string) => number | undefined;
  setDueDateForRow?: (
    std: BlockStdScope,
    rowId: string,
    value: number | undefined
  ) => void;
}
