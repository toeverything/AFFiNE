import { splitListCommand } from '@blocksuite/affine-block-list';
import { mergeWithPrev } from '@blocksuite/affine-block-paragraph';
import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { DatePicker } from '@blocksuite/affine-components/date-picker';
import { createLitPortal } from '@blocksuite/affine-components/portal';
import {
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
} from '@blocksuite/affine-shared/utils';
import { IS_MOBILE } from '@blocksuite/global/env';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { DateTimeIcon, PageIcon, PlusIcon } from '@blocksuite/icons/lit';
import type { BlockStdScope } from '@blocksuite/std';
import { ShadowlessElement } from '@blocksuite/std';
import { flip, offset } from '@floating-ui/dom';
import { signal } from '@preact/signals-core';
import { css, html, nothing, type TemplateResult } from 'lit';
import { customElement, eventOptions, property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import {
  EditorHostKey,
  RowHostKey,
} from '../../../core/context/host-context.js';
import type { TaskWorkflowCapableDataSource } from '../../../core/data-source/task-workflow-capable.js';
import { renderUniLit } from '../../../core/utils/uni-component/index.js';
import type { ListViewUILogic } from './list-view-ui-logic.js';

// Story 2.12 (MOBILE-03): touch has no `:hover` state, so the three
// hover-gated row-action classes below (note/due-date/drag-handle) are
// otherwise invisible on mobile web. This block reproduces
// `table/mobile/row.ts`'s already-shipped "opposite polarity" default —
// visible by default, hidden only during an editing-equivalent state — but
// inline (`IS_MOBILE`-gated), since List has no separate mobile component
// the way Table/Kanban do. List also has no `data-editing` DOM hook
// (unlike Table/Kanban's `[data-editing='true']`); the closest existing
// hook is the row's own `:focus-within` state (already used above for an
// unrelated background-highlight rule), reused here as the
// editing-equivalent trigger per RESEARCH.md Pattern 2 / Pitfall 4. The
// desktop `:hover` rules below are left completely unmodified (MOBILE-05).
const mobileListActionStyles = css`
  .affine-data-view-list-note-action,
  .affine-data-view-list-due-date-action,
  .affine-data-view-list-drag-handle {
    visibility: visible;
    opacity: 1;
  }

  /* Task 2 (live-verification finding, RESEARCH.md Pitfall 4 / Open
     Question 2): the whole-row \`:focus-within\` above incorrectly treated a
     mere row-select tap (the row itself receiving focus via its own
     \`tabindex="0"\`) as "editing", since \`:focus-within\` matches an
     element that itself holds focus, not only a focused descendant.
     Narrowed to \`:has(.affine-data-view-list-title:focus-within)\` so only
     focus that actually lands inside the title's own rich-text (genuine
     text-edit) triggers the hide -- confirmed via this plan's own
     editing-trigger correctness test (list-touch.spec.ts, Task 2). */
  .affine-data-view-list-row:has(.affine-data-view-list-title:focus-within)
    .affine-data-view-list-note-action,
  .affine-data-view-list-row:has(.affine-data-view-list-title:focus-within)
    .affine-data-view-list-due-date-action,
  .affine-data-view-list-row:has(.affine-data-view-list-title:focus-within)
    .affine-data-view-list-drag-handle {
    visibility: hidden;
    opacity: 0;
  }

  /* RESEARCH.md Pitfall 3: preventDefault() on the drag handle's
     pointerdown-equivalent does not reliably suppress touch-scrolling in
     all browsers without this -- no existing rule anywhere in this
     package's drag-handle CSS sets it. */
  .affine-data-view-list-drag-handle {
    touch-action: none;
  }
`;

@customElement('affine-data-view-list')
export class ListViewRenderer extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  private readonly cellEditing$ = signal(true);

  // Story 2.8: mirrors `TableViewUI.connectedCallback`'s own
  // `this.logic.ui$.value = this` + controller `hostConnected()` wiring —
  // `ListDragController` needs a live DOM anchor to query rows/handles
  // from, and `hostConnected` is where it registers its `dragStart`
  // listener.
  override connectedCallback() {
    super.connectedCallback();
    this.logic.ui$.value = this;
    this.logic.dragController.hostConnected();
  }

  /**
   * WR-01: `offset`, when given, restores the cursor at that exact inline
   * index (the merge-boundary position) instead of `focusEnd()`'s
   * unconditional jump to the absolute end of the merged text -- database
   * rows are rendered by this class's own `repeat()` directive, not as
   * registered `BlockComponent`s in `std.view`'s registry, so
   * `mergeWithPrev`'s own `asyncSetInlineRange`-based cursor restore always
   * silently no-ops for them (`std.view.getBlock(id)` returns `null`),
   * leaving this caller-supplied fallback as the only place a
   * merge-boundary offset can be applied.
   *
   * keyboard-focus-tabbar-coordination: must not defer the first attempt
   * through `requestAnimationFrame`. On-device iOS Safari captures (see
   * `.planning/debug/keyboard-focus-tabbar-coordination.md`) show
   * BlockSuite's own selection/active state updating correctly after
   * Enter/Backspace/Delete recreate or merge a row, but the real
   * on-screen keyboard failing to reopen -- sometimes for 5+ seconds and
   * several tap attempts. Mobile WebKit only re-summons the virtual
   * keyboard for a `.focus()` call that stays within the synchronous (or
   * microtask) continuation of the triggering trusted keydown;
   * `requestAnimationFrame` defers to the next paint -- a full macrotask
   * later -- which loses that activation window even when the target
   * row's DOM is already present and there is nothing to wait for. Retry
   * (when the just-created row's DOM hasn't mounted yet) via a plain
   * microtask instead, so every attempt stays as close as possible to the
   * original gesture.
   *
   * keyboard-focus-tabbar-coordination (round 2): the synchronous-first-
   * attempt fix above only ever helps the re-focus-an-EXISTING-row paths
   * (Backspace/Delete merge) -- a row freshly created by `addRowAfter`/
   * `splitRowAtCursor` (the Enter path, the one fresh on-device reports
   * say is STILL broken) never exists in the DOM yet at attempt 0. The
   * underlying reactive row list already reflects the new row
   * synchronously (Yjs mutation observers fire synchronously), but Lit's
   * own re-render (the `repeat()` directive that mounts the row) is
   * scheduled onto a microtask by default, so this path always fell
   * through to the microtask retry below -- which does not reliably
   * preserve iOS's keyboard-summon gesture window either. Force Lit's own
   * pending update to commit synchronously (bypassing its microtask
   * scheduler) so the just-created row's DOM exists before this first
   * attempt, keeping the eventual `.focus()`/`.focusEnd()` call in the
   * same call stack as the triggering keydown.
   */
  private focusRowTitle(rowId: string, offset?: number) {
    const focus = (attempt = 0) => {
      let row = this.querySelector<HTMLElement>(`[data-row-id="${rowId}"]`);
      if (!row && attempt === 0) {
        this.requestUpdate();
        this.performUpdate();
        row = this.querySelector<HTMLElement>(`[data-row-id="${rowId}"]`);
      }
      const titleCell = row?.querySelector<HTMLElement>(
        'data-view-header-area-text'
      ) as
        | (HTMLElement & {
            inlineEditor?: {
              focusEnd?: () => void;
              setInlineRange?: (range: {
                index: number;
                length: number;
              }) => void;
            };
            requestUpdate?: () => void;
            performUpdate?: () => void;
          })
        | null;
      // keyboard-enter-focus-loss: the row-level flush above only commits
      // ListViewRenderer's own template -- enough to append a fresh
      // HeaderAreaTextCell instance into the DOM for a brand-new row, but
      // that instance is its OWN separate LitElement whose first render()
      // (the one that creates <rich-text>, the only thing carrying a real
      // contenteditable) is independently scheduled on Lit's default
      // microtask scheduler, not flushed by the row's own performUpdate().
      // Force it synchronously too, on the first attempt, mirroring the
      // exact same pattern one level up -- otherwise titleCell.inlineEditor
      // is never ready on attempt 0 for a genuinely new row. See
      // .planning/debug/keyboard-enter-focus-loss.md.
      if (attempt === 0 && titleCell && !titleCell.inlineEditor) {
        titleCell.requestUpdate?.();
        titleCell.performUpdate?.();
      }
      const richText = row?.querySelector<
        HTMLElement & {
          requestUpdate?: () => void;
          performUpdate?: () => void;
        }
      >('rich-text');
      // Same gap, one level deeper still: <rich-text> is itself a separate
      // LitElement whose own render() (the thing that actually creates the
      // contenteditable div `inlineEditor` needs to summon a keyboard for)
      // is likewise deferred to a microtask unless forced.
      if (attempt === 0 && richText && !titleCell?.inlineEditor) {
        richText.requestUpdate?.();
        richText.performUpdate?.();
      }
      row?.focus();
      if (offset != null && titleCell?.inlineEditor?.setInlineRange) {
        titleCell.inlineEditor.setInlineRange({ index: offset, length: 0 });
      } else {
        titleCell?.inlineEditor?.focusEnd?.();
      }
      if (!titleCell?.inlineEditor && richText) {
        // <rich-text> itself is not contenteditable (its own render() puts
        // that on a descendant div) -- focusing the wrapper is a no-op that
        // leaves DOM focus wherever it already was, which is why this
        // fallback previously never actually reached a real editable node
        // for a brand-new row.
        const editable =
          richText.querySelector<HTMLElement>('[contenteditable]');
        (editable ?? richText).focus();
      }
      if (!titleCell?.inlineEditor && attempt < 5) {
        Promise.resolve()
          .then(() => focus(attempt + 1))
          .catch(console.error);
      }
    };
    focus();
  }

  /**
   * WR-03: shared inline-range lookup, previously duplicated verbatim
   * across the Backspace/Delete/Enter branches of `onRowKeyDown`.
   */
  private getInlineRange(
    currentTarget: HTMLElement
  ): { index: number; length: number } | null {
    const richText = currentTarget.querySelector<
      HTMLElement & {
        inlineEditor?: {
          getInlineRange?: () => { index: number; length: number } | null;
        };
      }
    >('rich-text');
    return richText?.inlineEditor?.getInlineRange?.() ?? null;
  }

  static override styles = css`
    .affine-data-view-list {
      display: flex;
      flex-direction: column;
      padding: 2px 0;
    }

    .affine-data-view-list-row {
      display: flex;
      align-items: center;
      min-height: 28px;
      padding: 1px 8px;
      box-sizing: border-box;
    }

    .affine-data-view-list-title {
      flex: 1;
      min-width: 0;
    }

    .affine-data-view-list-fields {
      display: inline-flex;
      align-items: center;
      flex-wrap: nowrap;
      gap: 6px;
      margin-left: 0;
      min-width: 0;
    }

    .affine-data-view-list-fields[data-layout='inline'] {
      margin-left: 2px;
      margin-right: 0;
      justify-content: flex-start;
    }

    .affine-data-view-list-fields[data-layout='aligned'] {
      margin-left: auto;
      width: min(40vw, 360px);
      justify-content: flex-end;
      display: grid;
      grid-template-columns: repeat(
        var(--affine-list-field-count),
        minmax(108px, 1fr)
      );
      gap: 8px;
    }

    .affine-data-view-list-fields[data-layout='right'] {
      margin-left: auto;
      justify-content: flex-end;
      width: min(40vw, 360px);
      display: grid;
      grid-template-columns: repeat(
        var(--affine-list-field-count),
        minmax(108px, 1fr)
      );
      gap: 8px;
    }

    .affine-data-view-list-field {
      border: 1px solid var(--affine-border-color);
      border-radius: 6px;
      font-size: 12px;
      line-height: 20px;
      padding: 0 8px;
      margin: 1px 0 0 8px;
      width: auto;
      min-width: 72px;
      max-width: 100%;
      text-align: left;
      flex: 0 1 auto;
      background: transparent;
      color: var(--affine-text-primary-color);
      outline: none;
      box-sizing: border-box;
    }

    .affine-data-view-list-field-number {
      text-align: right;
    }

    .affine-data-view-list-fields[data-layout='aligned']
      .affine-data-view-list-field,
    .affine-data-view-list-fields[data-layout='right']
      .affine-data-view-list-field {
      width: 100%;
      min-width: 0;
      max-width: none;
      margin-left: 0;
    }

    .affine-data-view-list-fields[data-layout='right']
      .affine-data-view-list-field {
      justify-self: end;
    }

    .affine-data-view-list-row:focus-within {
      background: var(--affine-hover-color);
      border-radius: 6px;
    }

    .affine-data-view-list-note-action {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      margin-left: 4px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--affine-icon-color);
      visibility: hidden;
      opacity: 0;
    }

    .affine-data-view-list-row:hover .affine-data-view-list-note-action {
      visibility: visible;
      opacity: 1;
    }

    .affine-data-view-list-note-action:hover {
      background: var(--affine-hover-color);
    }

    .affine-data-view-list-due-date-action {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      margin-left: 4px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--affine-icon-color);
      visibility: hidden;
      opacity: 0;
    }

    .affine-data-view-list-row:hover .affine-data-view-list-due-date-action {
      visibility: visible;
      opacity: 1;
    }

    .affine-data-view-list-due-date-action:hover {
      background: var(--affine-hover-color);
    }

    /* Story 2.8: left-side drag handle — visually mirrors table view's own
       .data-view-table-view-drag-handler (table/pc/row/row.ts): same
       grey pill, same hover-only visibility, same grab cursor. Sits before
       the indent spacer so it stays at a consistent near-left position
       regardless of the row's own hierarchy depth (matching table's
       dedicated left-bar column, which also never indents). */
    .affine-data-view-list-drag-handle {
      width: 12px;
      height: 20px;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      visibility: hidden;
      opacity: 0;
      /* Load-bearing, not cosmetic. This handle is CHROME, not content: it holds
         a bare decorative grip div and no selectable text. Without this it can
         still anchor a native text selection, and because it sits immediately
         left of character 0 of the title, a click-drag begun anywhere in its
         12px hit area produced a selection whose ANCHOR was here (outside the
         title's inline root) while its focus was inside it. A selection that
         straddles the editable boundary has no single editing host, so the
         browser emits NO beforeinput event at all -- and beforeinput is the only
         channel through which BlockSuite's inline editor applies any edit.
         The result was that Backspace, Delete AND typing a replacement all
         silently did nothing, with no handler ever running and nothing calling
         preventDefault. Measured directly: the event log for such a Backspace is
         [keydown] and nothing else, while the identical selection anchored one
         pixel further right logs [keydown -> beforeinput -> delete applied].
         It was reported as "any selection including the first character fails"
         because the gutter is the only thing left of character 0 -- you can only
         begin a drag here when index 0 ends up in the selection.
         Regression test: tests/affine-local/e2e/row-index0-anchor-origin.spec.ts */
      user-select: none;
      -webkit-user-select: none;
    }

    .affine-data-view-list-row:hover .affine-data-view-list-drag-handle {
      visibility: visible;
      opacity: 1;
    }

    .affine-data-view-list-indent-spacer {
      flex-shrink: 0;
      /* Same reason as the drag handle above: this spacer is pure layout chrome
         sitting in the row's leading gutter, left of character 0. Left
         selectable, it becomes the next available out-of-root anchor once the
         handle stops being one, which would reintroduce the identical dead
         keystroke a few pixels over. */
      user-select: none;
      -webkit-user-select: none;
    }

    ${IS_MOBILE ? mobileListActionStyles : css``}
  `;

  @property({ attribute: false })
  accessor logic!: ListViewUILogic;

  private get view() {
    return this.logic.view;
  }

  private get noteCapableDataSource(): TaskWorkflowCapableDataSource {
    return this.view.manager
      .dataSource as unknown as TaskWorkflowCapableDataSource;
  }

  private get std(): BlockStdScope | undefined {
    return this.view.serviceGet(EditorHostKey)?.std;
  }

  /**
   * The std whose `store` actually owns this view's row blocks — always use
   * this (never `this.std`) to resolve a row's `BlockModel` or to run a
   * block command against one.
   *
   * `this.std` comes from `EditorHostKey`, which is deliberately the OUTER
   * page's host so that row actions creating blocks "on the current page"
   * land where the user is looking (see `database-block.ts`'s `dataSource`
   * init). When this database is rendered nested inside a CROSS-DOC
   * `database-ref`/`database-view-ref`, that outer store contains none of
   * the rows — `getBlock(rowId)` returns `undefined` for every one of them.
   *
   * That mismatch is what made Enter on a *non-empty* cross-doc row unindent
   * it: with `model` undefined, `onRowKeyDown`'s `(model?.text?.length ?? 0)
   * > 0` emptiness test reported "empty" for every row, so every Enter fell
   * through to the LIST-03/LIST-04 empty-row path (dedent at level > 0,
   * add-sibling at level 0). The same wrong-store read also silently killed
   * cross-doc Backspace/Delete row merging.
   *
   * Falls back to `this.std` for any data source that predates `RowHostKey`
   * (nothing outside `affine-database` registers it), which restores the
   * previous same-doc-only behavior rather than breaking those callers.
   */
  private get rowStd(): BlockStdScope | undefined {
    return this.view.serviceGet(RowHostKey)?.std ?? this.std;
  }

  /**
   * The row's own persistent highlight — independent of whether a
   * `note-ref` currently exists on *this* page (a carried-over task's Note
   * reference can be set from an earlier day, long before this exact page
   * ever reveals/inserts it) — per direct user request: the row itself
   * should always show its assigned color the moment the row is rendered
   * on any page, since that's the visual cue "this task is in-progress /
   * has a note", not just a hover affordance.
   */
  private getRowNoteColor(rowId: string): string | undefined {
    const dataSource = this.noteCapableDataSource;
    if (typeof dataSource.getResolvedNoteColor !== 'function') {
      return undefined;
    }
    const std = this.std;
    if (!std) return undefined;
    return dataSource.getResolvedNoteColor(std, rowId);
  }

  /**
   * Story 2.7: overdue-and-undone treatment for this row — `null` if
   * neither highlight nor hide applies (see `DatabaseBlockDataSource.
   * getDueDateHighlightState`'s own doc comment for the full condition).
   */
  private getRowDueDateState(rowId: string): 'highlight' | 'hide' | null {
    const dataSource = this.noteCapableDataSource;
    if (typeof dataSource.getDueDateHighlightState !== 'function') {
      return null;
    }
    const std = this.std;
    if (!std) return null;
    return dataSource.getDueDateHighlightState(std, rowId);
  }

  /**
   * Row-level "attach a note" button (Story 2.6) — gated on the data
   * source actually being todo-capable (`getTaskStatusColumn` present and
   * resolving), per direct user request: a plain generic database/reference
   * table should never grow this button, only a Journal Todo-style table.
   * CSS-`:hover`-revealed, mirroring `table/pc/row/row.ts`'s own
   * `.show-on-hover-row` pattern (list rows are plain, non-virtualized DOM,
   * so CSS `:hover` scopes correctly here, unlike the virtualized table
   * variant).
   */
  private renderNoteAction(rowId: string) {
    const dataSource = this.noteCapableDataSource;
    if (typeof dataSource.getTaskStatusColumn !== 'function') {
      return nothing;
    }
    if (!dataSource.getTaskStatusColumn()) {
      return nothing;
    }
    const std = this.std;
    if (!std) {
      return nothing;
    }

    const ref = dataSource.getNoteRef?.(rowId);
    if (!ref) {
      const onClick = (e: MouseEvent) => {
        e.stopPropagation();
        popMenu(popupTargetFromElement(e.currentTarget as HTMLElement), {
          options: {
            items: [
              menu.action({
                name: 'New note',
                prefix: PageIcon(),
                select: () => {
                  dataSource.createNoteForRow?.(std, rowId);
                },
              }),
              menu.action({
                name: 'Link existing note',
                prefix: PageIcon(),
                select: () => {
                  dataSource
                    .attachExistingNoteForRow?.(std, rowId)
                    .catch(console.error);
                },
              }),
            ],
          },
        });
      };
      return html`<div
        class="affine-data-view-list-note-action"
        data-testid="note-action-create"
        @click=${onClick}
      >
        ${PlusIcon()}
      </div>`;
    }

    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      dataSource.revealOrInsertNoteForRow?.(std, rowId);
    };
    // 999.9: standard icon colour, same as the due-date button beside it. It
    // used to be tinted with the note's own (pale pastel) colour, which made
    // it nearly invisible on dark themes; the row background already shows
    // the note colour.
    return html`<div
      class="affine-data-view-list-note-action"
      data-testid="note-action-open"
      @click=${onClick}
    >
      ${PageIcon()}
    </div>`;
  }

  // Keyed by rowId — a single shared controller would make opening the
  // picker on one row silently no-op clicks on every other row's due-date
  // button while that first popup is still open.
  private readonly _dueDatePortalAbortControllers = new Map<
    string,
    AbortController
  >();

  /**
   * Row-level "set due date" button (Story 2.7, Task 3) — sibling to
   * `renderNoteAction`, same task-status-capability gating and CSS-`:hover`
   * mechanism. Variant (b) per the story's own Resolved Design Decision 5:
   * a plain date-selection dialog that writes `dueDate` and does not touch
   * column visibility. Reuses the exact same `DatePicker`/`createLitPortal`
   * combination the Date property's own cell editor uses
   * (`property-presets/date/cell-renderer.ts`) rather than building a new
   * date-picker component.
   */
  private renderDueDateAction(rowId: string) {
    const dataSource = this.noteCapableDataSource;
    if (typeof dataSource.getTaskStatusColumn !== 'function') {
      return nothing;
    }
    if (!dataSource.getTaskStatusColumn()) {
      return nothing;
    }
    if (typeof dataSource.setDueDateForRow !== 'function') {
      return nothing;
    }
    const std = this.std;
    if (!std) {
      return nothing;
    }

    const currentValue = dataSource.getDueDateForRow?.(rowId);

    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      const existing = this._dueDatePortalAbortControllers.get(rowId);
      if (existing && !existing.signal.aborted) {
        return;
      }
      const target = e.currentTarget as HTMLElement;
      const abortController = new AbortController();
      this._dueDatePortalAbortControllers.set(rowId, abortController);
      const { portal } = createLitPortal({
        abortController,
        closeOnClickAway: true,
        computePosition: {
          referenceElement: target,
          placement: 'bottom',
          middleware: [offset(10), flip()],
        },
        template: () => {
          const datePicker = new DatePicker();
          datePicker.value = currentValue ?? Date.now();
          datePicker.popup = true;
          datePicker.onClear = () => {
            dataSource.setDueDateForRow?.(std, rowId, undefined);
            abortController.abort();
          };
          datePicker.onChange = (date: Date) => {
            dataSource.setDueDateForRow?.(std, rowId, date.getTime());
            abortController.abort();
          };
          datePicker.onEscape = () => {
            abortController.abort();
          };
          requestAnimationFrame(() => datePicker.focusDateCell());
          return datePicker;
        },
      });
      portal.style.zIndex = '1002';
    };

    return html`<div
      class="affine-data-view-list-due-date-action"
      data-testid="due-date-action"
      @click=${onClick}
    >
      ${DateTimeIcon()}
    </div>`;
  }

  /**
   * Story 2.8: left-side drag handle — only rendered for a todo-capable,
   * non-readonly view (same gating `renderNoteAction`/`renderDueDateAction`
   * already use for their own todo-only affordances). The handle itself is
   * inert here (no drag wiring) — `ListDragController` (Story 2.8, Task 1)
   * owns starting a drag from it, matching table's own separation between
   * this file's markup and `table/pc/controller/drag.ts`'s event handling.
   */
  private renderDragHandle(rowId: string) {
    const dataSource = this.noteCapableDataSource;
    if (typeof dataSource.getTaskStatusColumn !== 'function') {
      return nothing;
    }
    if (!dataSource.getTaskStatusColumn()) {
      return nothing;
    }
    if (this.view.readonly$.value) {
      return nothing;
    }
    return html`<div
      class="affine-data-view-list-drag-handle"
      data-testid="drag-handle"
      data-row-id=${rowId}
    >
      <div
        style="width: 4px;
        border-radius: 2px;
        height: 12px;
        background-color: var(--affine-placeholder-color);"
      ></div>
    </div>`;
  }

  private getHierarchyLevel(rowId: string) {
    const property = this.view.propertiesRaw$.value.find(
      property => property.name$.value === TASK_HIERARCHY_LEVEL_COLUMN_NAME
    );
    const value = property
      ? this.view.cellGetOrCreate(rowId, property.id).value$.value
      : undefined;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
    }
    return 0;
  }

  /**
   * Enter mid-text (LIST-02): splits the row's text at the cursor via the
   * native `splitListCommand`, then copies the hierarchy columns
   * (`TASK_HIERARCHY_LEVEL_COLUMN_NAME`/`TASK_PARENT_IDENTIFIER_COLUMN_NAME`/
   * `TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME`) from the original row onto the
   * new sibling -- `splitListCommand` itself only ever inserts the new row
   * as a flat sibling (case 5/6, since database rows never have real
   * block-tree children) and does not know about these data-view-only
   * virtual-hierarchy columns, defaulting the new row to level 0.
   *
   * Writes go through `dataSource.applyTaskHierarchyMutation` (the same
   * privileged path `ListViewUILogic.addRowAfter` uses), NOT
   * `property.valueSetFromString` -- all three columns are listed in
   * `DatabaseBlockDataSource`'s own `READONLY_SYSTEM_COLUMN_NAMES`, so the
   * generic `cellValueChange` write path `valueSetFromString` routes
   * through silently no-ops for them (confirmed live: reads succeed,
   * writes are dropped). `applyTaskHierarchyMutation` is the sanctioned
   * bypass for exactly this kind of system-managed, code-only mutation.
   */
  private splitRowAtCursor(rowId: string, inlineIndex: number): void {
    const std = this.rowStd;
    const model = std?.store.getBlock(rowId)?.model;
    if (!model || !std) {
      return;
    }
    const parent = std.store.getParent(model);
    const originalIndex = parent?.children.findIndex(c => c.id === rowId) ?? -1;
    const level = this.getHierarchyLevel(rowId);
    const getColumnStringValue = (columnName: string) => {
      const property = this.view.propertiesRaw$.value.find(
        property => property.name$.value === columnName
      );
      return property?.stringValueGet(rowId) ?? '';
    };
    const rowParent = getColumnStringValue(TASK_PARENT_IDENTIFIER_COLUMN_NAME);
    const ancestors = getColumnStringValue(
      TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME
    );
    std.command
      .chain()
      .pipe(splitListCommand, { blockId: rowId, inlineIndex })
      .run();
    if (originalIndex < 0 || !parent) {
      return;
    }
    const newRow = parent.children[originalIndex + 1];
    if (!newRow) {
      return;
    }
    // CR-01: `splitListCommand` always inserts `newRow` immediately after
    // the original row (`originalIndex + 1`) -- but if the original row
    // already has indented sub-rows (contiguous following rows with a
    // higher hierarchy level, per `_resolveMovingSubtree`'s own
    // definition), that insertion point sits BEFORE those sub-rows,
    // silently re-parenting them under the new sibling instead of leaving
    // them under the original row. Walk past the original row's full
    // subtree first, mirroring `ListViewUILogic.addRowAfter`'s own
    // skip-forward `insertIndex` walk, before deciding where `newRow`
    // really belongs.
    let insertAfter = originalIndex + 1; // newRow's own index
    while (insertAfter + 1 < parent.children.length) {
      const candidate = parent.children[insertAfter + 1];
      if (!candidate) {
        break;
      }
      if (this.getHierarchyLevel(candidate.id) <= level) {
        break;
      }
      insertAfter += 1;
    }
    if (insertAfter > originalIndex + 1) {
      const target = parent.children[insertAfter + 1] ?? null;
      std.store.moveBlocks([newRow], parent, target);
    }
    const dataSource = this.view.manager?.dataSource as
      | {
          applyTaskHierarchyMutation?: (
            updatedLevels: Map<string, number>,
            updatedParents: Map<string, string | undefined>,
            updatedAncestors: Map<string, string>
          ) => void;
        }
      | undefined;
    if (dataSource?.applyTaskHierarchyMutation) {
      dataSource.applyTaskHierarchyMutation(
        new Map([[newRow.id, level]]),
        new Map([[newRow.id, rowParent || undefined]]),
        new Map([[newRow.id, ancestors]])
      );
    } else {
      // WR-04: this fallback is a documented no-op against the real
      // `DatabaseBlockDataSource` (see doc comment above -- all three
      // columns are `READONLY_SYSTEM_COLUMN_NAMES`), kept only for parity
      // with `addRowAfter`'s own identical fallback. Surface it loudly if
      // it's ever actually reached, so a future data source that drops
      // `applyTaskHierarchyMutation` doesn't silently regress into this
      // guaranteed-broken path with no test failure.
      console.error(
        'splitRowAtCursor: dataSource is missing applyTaskHierarchyMutation; ' +
          'falling back to a write path that is a no-op for read-only system columns.'
      );
      const copyColumnValue = (columnName: string) => {
        const property = this.view.propertiesRaw$.value.find(
          property => property.name$.value === columnName
        );
        if (!property) {
          return;
        }
        property.valueSetFromString(
          newRow.id,
          property.stringValueGet(rowId) ?? ''
        );
      };
      copyColumnValue(TASK_HIERARCHY_LEVEL_COLUMN_NAME);
      copyColumnValue(TASK_PARENT_IDENTIFIER_COLUMN_NAME);
      copyColumnValue(TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME);
    }
    this.focusRowTitle(newRow.id);
    // keyboard-enter-focus-loss (desktop, 2026-10-01): `splitListCommand`
    // above (deliberately called WITHOUT `skipFocus` -- see history below)
    // internally calls `focusTextModel`/`selectTextModel` to update
    // `std.selection` to point at the newly-split text model. A database
    // list-view row is not a registered `BlockComponent` in `std.view`'s
    // registry (it's rendered by this class's own `repeat()` directive
    // instead -- see `focusRowTitle`'s own doc comment), so when
    // `RangeBinding._onStdSelectionChanged` tries to sync the native
    // browser selection/focus to match, it cannot resolve a real DOM
    // target and calls `.clear()` -- wiping out the focus `focusRowTitle`
    // just established above. Confirmed live via a `focusout`
    // capture-phase listener + stack trace:
    // `RangeBinding._onStdSelectionChanged -> syncTextSelectionToRange ->
    // clear() <- selectTextModel <- focusTextModel <- splitListCommand`,
    // with `relatedTarget: null` (a genuine clear, not a legitimate focus
    // move elsewhere).
    //
    // History, since this went back and forth live: a `skipFocus` option
    // was added to `splitListCommand` to PREVENT this clear at the source
    // instead of reacting to it -- it passed an automated Playwright test
    // reliably (including typing immediately after Enter, faster than a
    // human). But on the user's real ~70-row list, `skipFocus` made things
    // WORSE, not better: confirmed live (user: "now the enter does not
    // work again"). Leading theory, not yet proven: `skipFocus` also
    // prevents `splitListCommand` from EVER updating `std.selection` to
    // point at the new row, which may leave BlockSuite's own internal
    // selection state permanently out of sync with DOM focus on this
    // unregistered-component row -- plausibly causing repeated/ongoing
    // instability rather than the one clean clear this listener is built
    // to catch. Reverted to NOT passing `skipFocus`, confirmed working
    // live on the user's real list. The automated test
    // (row-enter-focus-loss.spec.ts) was written against the skipFocus
    // version and encodes a stricter guarantee (zero-delay typing) than
    // this reactive version actually provides -- see that test's own
    // updated comments for the accepted trade-off.
    //
    // Self-heal: if focus is cleared to nothing shortly after, reclaim
    // it -- scoped narrowly to "cleared to null" so a real, intentional
    // focus move elsewhere (e.g. the user clicking another row) is never
    // fought. No console logging here -- confirmed live that tracing on
    // every focusout was itself a material latency contributor on large
    // lists.
    const newRowId = newRow.id;
    const reclaimFocus = (e: FocusEvent) => {
      if (e.relatedTarget === null) {
        this.focusRowTitle(newRowId);
        document.removeEventListener('focusout', reclaimFocus, true);
      }
    };
    document.addEventListener('focusout', reclaimFocus, true);
    setTimeout(
      () => document.removeEventListener('focusout', reclaimFocus, true),
      1000
    );
  }

  private renderCell(rowId: string, propertyId: string) {
    const property = this.view.propertyGetOrCreate(propertyId);
    const renderer = property.meta$.value?.renderer.cellRenderer.view;
    if (!renderer) {
      return nothing;
    }
    const cell = this.view.cellGetOrCreate(rowId, propertyId);
    return renderUniLit(renderer, {
      cell,
      isEditing$: this.cellEditing$,
      selectCurrentCell: () => {},
    });
  }

  private renderDetailValue(rowId: string, propertyId: string) {
    const property = this.view.propertyGetOrCreate(propertyId);
    const cell = this.view.cellGetOrCreate(rowId, propertyId);
    const value = cell.stringValue$.value ?? '';
    const propertyType = property.type$.value;
    const commitOnBlur =
      propertyType === 'select' || propertyType === 'multi-select';
    const commit = (target: HTMLInputElement) => {
      property.valueSetFromString(rowId, target.value.trim());
    };
    const onInput = (event: InputEvent) => {
      if (commitOnBlur) {
        return;
      }
      const target = event.target as HTMLInputElement;
      commit(target);
    };
    const onBlur = (event: FocusEvent) => {
      if (!commitOnBlur) {
        return;
      }
      commit(event.target as HTMLInputElement);
    };
    const stop = (event: Event) => event.stopPropagation();
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (event.key === 'Enter' && commitOnBlur) {
        (event.target as HTMLInputElement).blur();
      }
    };
    return html`<input
      class=${propertyType === 'number'
        ? 'affine-data-view-list-field affine-data-view-list-field-number'
        : 'affine-data-view-list-field'}
      .value=${value}
      placeholder=${property.name$.value}
      inputmode=${propertyType === 'number' ? 'decimal' : 'text'}
      @input=${onInput}
      @blur=${onBlur}
      @change=${onBlur}
      @keydown=${onKeyDown}
      @mousedown=${stop}
      @click=${stop}
    />`;
  }

  @eventOptions({ capture: true })
  private onRowFocusIn(event: FocusEvent) {
    const rowId = (event.currentTarget as HTMLElement | null)?.dataset.rowId;
    if (rowId) {
      this.logic.ensureTodoListRow(rowId);
    }
  }

  @eventOptions({ capture: true })
  private onRowKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
      return;
    }
    const rowId = (event.currentTarget as HTMLElement | null)?.dataset.rowId;
    if (!rowId) {
      return;
    }
    this.logic.ensureTodoListRow(rowId);
    if (event.key === 'Backspace') {
      if (this.view.readonly$.value) {
        return;
      }
      const range = this.getInlineRange(event.currentTarget as HTMLElement);
      if (!range) {
        return;
      }
      if (range.index !== 0 || range.length !== 0) {
        return;
      }
      const rows = this.view.rows$.value;
      const rowIndex = rows.findIndex(r => r.rowId === rowId);
      if (rowIndex <= 0) {
        return;
      }
      const prevRowId = rows[rowIndex - 1]?.rowId;
      const std = this.rowStd;
      const model = std?.store.getBlock(rowId)?.model;
      if (!prevRowId || !model || !std) {
        return;
      }
      // CR-02: `prevRowId` comes from the view-filtered `rows$.value`
      // (filter/search-reduced), but the actual merge below
      // (`mergeWithPrev` -> `getPrevContentBlock`) is a pure block-tree
      // walk over `parent.children` with zero knowledge of the view's
      // filter/search state. When a filter/search hides a row between the
      // two, those diverge: the block-tree merge would silently target a
      // currently-hidden row while focus lands on an unrelated, unmodified
      // visible row. Bail out rather than merging into a row the user
      // cannot currently see.
      const parent = std.store.getParent(model);
      const modelIndex = parent?.children.findIndex(c => c.id === rowId) ?? -1;
      const blockTreePrevId =
        modelIndex > 0 ? parent?.children[modelIndex - 1]?.id : undefined;
      if (blockTreePrevId !== prevRowId) {
        return;
      }
      // WR-01: capture the previous row's own text length BEFORE the join
      // so the cursor can be restored at the merge boundary, not the
      // absolute end of the merged text.
      const prevModel = std.store.getBlock(prevRowId)?.model;
      const prevTextLengthBeforeJoin = prevModel?.text?.length ?? 0;
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      mergeWithPrev(std.host, model);
      this.focusRowTitle(prevRowId, prevTextLengthBeforeJoin);
      return;
    }
    if (event.key === 'Delete') {
      if (this.view.readonly$.value) {
        return;
      }
      const range = this.getInlineRange(event.currentTarget as HTMLElement);
      const std = this.rowStd;
      const model = std?.store.getBlock(rowId)?.model;
      if (!model || !std) {
        return;
      }
      if (!range || range.length !== 0) {
        return;
      }
      if (range.index !== (model.text?.length ?? 0)) {
        return;
      }
      const rows = this.view.rows$.value;
      const rowIndex = rows.findIndex(r => r.rowId === rowId);
      const nextRowId = rows[rowIndex + 1]?.rowId;
      if (!nextRowId) {
        return;
      }
      const nextModel = std.store.getBlock(nextRowId)?.model;
      if (!nextModel) {
        return;
      }
      // CR-02: mirror the Backspace guard above -- `nextRowId` is the
      // view-filtered next row, but `mergeWithPrev(nextModel)` resolves its
      // own merge target via a pure block-tree walk starting from
      // `nextModel`. Only proceed when the filtered neighbor is also the
      // real block-tree-adjacent next row.
      const parent = std.store.getParent(model);
      const modelIndex = parent?.children.findIndex(c => c.id === rowId) ?? -1;
      const blockTreeNextId =
        modelIndex >= 0 ? parent?.children[modelIndex + 1]?.id : undefined;
      if (blockTreeNextId !== nextRowId) {
        return;
      }
      // WR-01: the merge boundary is this row's own pre-merge text length
      // (`range.index`, already asserted equal to it above) -- restore the
      // cursor there instead of jumping to the absolute end of the merged
      // text.
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      mergeWithPrev(std.host, nextModel);
      this.focusRowTitle(rowId, range.index);
      return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      if (this.view.readonly$.value) {
        return;
      }
      const model = this.rowStd?.store.getBlock(rowId)?.model;
      const range = this.getInlineRange(event.currentTarget as HTMLElement);
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      // Fail safe, not fail quiet: an unresolvable row model is NOT the same
      // thing as an empty row, and must never be allowed to masquerade as
      // one. Conflating the two is exactly how a cross-doc reference's rows
      // (invisible to the outer page's store, see `rowStd`) got silently
      // unindented on every Enter instead of split -- `model?.text?.length ??
      // 0` reported 0 for a row full of text. With `rowStd` that lookup now
      // succeeds, so this guard should be unreachable; if some future data
      // source reintroduces a store gap, doing nothing is recoverable
      // whereas re-leveling the user's hierarchy is not.
      if (!model) {
        console.error(
          `list view: Enter pressed on row ${rowId}, but its block model ` +
            'could not be resolved from any known store -- ignoring the ' +
            'keypress rather than treating the row as empty.'
        );
        return;
      }
      if ((model.text?.length ?? 0) > 0) {
        // LIST-02: split at the cursor, preserving hierarchy level on the
        // new sibling.
        this.splitRowAtCursor(rowId, range?.index ?? model.text!.length);
        return;
      }
      // Empty row.
      const level = this.getHierarchyLevel(rowId);
      if (level > 0) {
        // LIST-03: dedent by one level instead of creating a blank row --
        // reuses the existing, already-working Shift-Tab mechanism
        // (`ListViewUILogic.unindentRow`), NOT the native
        // `dedentListCommand`: `affine:database`'s block schema role is
        // 'hub', never 'content', so `canDedentListCommand`'s
        // `parent.role !== 'content'` guard can never succeed for a
        // database row.
        this.logic.unindentRow(rowId);
        this.requestUpdate();
        return;
      }
      // LIST-04: root-level (level 0) empty row -- only ever adds a
      // sibling, never touches its own level. Bug 3 (suspected
      // `ensureRowAsTodoList`-driven level corruption on this exact path)
      // was live-reproduced (D-04) and did NOT reproduce: a row created via
      // `rowAddAsTodoList` is already `affine:list` by the time Enter is
      // pressed on it, so `ensureTodoListRow`'s early-return-if-already-list
      // guard means the level-reset-to-0 branch in `ensureRowAsTodoList`
      // (which only fires when converting a still-`affine:paragraph` row)
      // is never reached for this row. This call is therefore unchanged
      // from the prior unconditional behavior -- only its gating changed.
      const newRowId = this.logic.addRowAfter(rowId);
      this.focusRowTitle(newRowId);
      return;
    }
    if (event.key === 'Tab') {
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      if (event.shiftKey) {
        this.logic.unindentRow(rowId);
      } else {
        this.logic.indentRow(rowId);
      }
      this.requestUpdate();
      return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const rowIds = this.view.rows$.value.map(row => row.rowId);
      const index = rowIds.indexOf(rowId);
      if (index < 0) {
        return;
      }
      const targetIndex = event.key === 'ArrowUp' ? index - 1 : index + 1;
      const targetRowId = rowIds[targetIndex];
      if (!targetRowId) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      event.stopPropagation();
      this.focusRowTitle(targetRowId);
    }
  }

  override render(): TemplateResult | typeof nothing {
    if (!this.logic) {
      return nothing;
    }
    const titleColumn = this.view.mainProperties$.value.titleColumn;
    let detailProperties = this.view.detailProperties$.value.filter(
      property => property.id !== titleColumn
    );
    // Story 2.7 (live-render fix): force Due date into the rendered detail
    // fields when the live "Show 'Due date' in Journal todo" setting is on
    // — regardless of whatever the column's *persisted* hide flag says.
    // The persisted flag is only a creation-time default (see
    // `getShowDueDateColumnSetting`'s own doc comment); this is the
    // reliable, always-correct path, mirroring `getRowDueDateState`'s own
    // already-proven live-read-on-every-render pattern.
    const dataSource = this.noteCapableDataSource;
    const std = this.std;
    if (
      std &&
      typeof dataSource.getShowDueDateColumnSetting === 'function' &&
      typeof dataSource.getDueDateColumn === 'function' &&
      dataSource.getShowDueDateColumnSetting(std)
    ) {
      const dueDateColumnId = dataSource.getDueDateColumn()?.id;
      // An *explicit* `hide: true` entry (as opposed to no entry at all,
      // which just means "never touched, follow the global default") means
      // a user deliberately hid this column via the properties menu for
      // this specific view — that manual choice must stick even while the
      // global setting is on (Decision 1/AC1's "always sticks" guarantee).
      const explicitlyHidden =
        dueDateColumnId != null &&
        this.view.data$.value?.columns.find(
          column => column.id === dueDateColumnId
        )?.hide === true;
      if (
        dueDateColumnId &&
        !explicitlyHidden &&
        !detailProperties.some(property => property.id === dueDateColumnId)
      ) {
        const dueDateProperty = this.view.propertyGetOrCreate(dueDateColumnId);
        detailProperties = [...detailProperties, dueDateProperty];
      }
    }
    const fieldLayout = this.view.fieldLayout$.value;
    // Deferred to a microtask rather than run synchronously inline here:
    // `ensureTodoListRows` -> `ensureRowAsTodoList` can `deleteBlock` then
    // `addBlock` a row (converting a plain paragraph to a todo `affine:list`
    // with the same id) as two separate, non-transactional ops — mutating
    // the doc *while this very render() call is still executing* raced the
    // `repeat()` directive below (which reads `this.view.rows$.value`
    // again, moments later, in the same call) against whatever the
    // block-tree's own reactive rendering was doing in response to that
    // same delete+recreate, and could leave the list showing no rows at
    // all until something else forced a further render. Matches
    // `TableSingleView`'s/`KanbanSingleView`'s own established
    // `queueMicrotask` pattern for this exact class of "mutate once the
    // current render settles" need.
    //
    // Deliberately never calls `requestUpdate()` off the back of this:
    // `ensureRowAsTodoList`'s return value means "is this row todo-type"
    // (true for a row that *was already* todo, per its own tested
    // contract — see `database.unit.spec.ts`), not "did a conversion just
    // happen" — so using it to decide whether to force a re-render means
    // any list view with even one pre-existing todo row returns `true`
    // forever, on every single render, forcing another `requestUpdate()`
    // every time: a genuine infinite render loop (confirmed live — it
    // froze the page). The one case that actually needs a re-render (a
    // paragraph really converted to `affine:list`) already changes
    // `model.children`, which `SignalWatcher` already re-renders for via
    // the normal `rows$` reactivity — no manual trigger needed.
    queueMicrotask(() => {
      this.logic.ensureTodoListRows(
        this.view.rows$.value.map(row => row.rowId)
      );
    });
    return html`${this.logic.headerWidget
        ? renderUniLit(this.logic.headerWidget, { dataViewLogic: this.logic })
        : nothing}
      <div class="affine-data-view-list">
        ${repeat(
          // Story 2.7 (AC5): a row whose resolved overdue-and-undone
          // setting is `'hide'` is excluded from the list entirely — not
          // hidden via CSS, since it should also not occupy layout space
          // or be tab-reachable, matching the "excluded from view" wording
          // of the AC (as opposed to `'highlight'`, which stays visible).
          this.view.rows$.value.filter(
            row => this.getRowDueDateState(row.rowId) !== 'hide'
          ),
          row => row.rowId,
          row => {
            const indent = this.getHierarchyLevel(row.rowId) * 24;
            const noteColor = this.getRowNoteColor(row.rowId);
            const isOverdueHighlighted =
              this.getRowDueDateState(row.rowId) === 'highlight';
            return html`<div
              class="affine-data-view-list-row"
              data-row-id=${row.rowId}
              data-overdue=${isOverdueHighlighted ? 'true' : nothing}
              tabindex="0"
              style="${noteColor
                ? `background-color: ${noteColor}; border-radius: 6px;`
                : ''}${isOverdueHighlighted
                ? ' color: var(--affine-error-color); font-weight: 600;'
                : ''}"
              @focusin=${this.onRowFocusIn}
              @keydown=${this.onRowKeyDown}
            >
              ${this.renderDragHandle(row.rowId)}
              <div
                class="affine-data-view-list-indent-spacer"
                style="width: ${indent}px"
              ></div>
              <div class="affine-data-view-list-title">
                ${titleColumn
                  ? this.renderCell(row.rowId, titleColumn)
                  : nothing}
              </div>
              ${detailProperties.length
                ? html`<div
                    class="affine-data-view-list-fields"
                    data-layout=${fieldLayout}
                    style="--affine-list-field-count: ${Math.max(
                      detailProperties.length,
                      1
                    )}"
                  >
                    ${detailProperties.map(property =>
                      this.renderDetailValue(row.rowId, property.id)
                    )}
                  </div>`
                : nothing}
              ${this.renderNoteAction(row.rowId)}
              ${this.renderDueDateAction(row.rowId)}
            </div>`;
          }
        )}
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-list': ListViewRenderer;
  }
}
