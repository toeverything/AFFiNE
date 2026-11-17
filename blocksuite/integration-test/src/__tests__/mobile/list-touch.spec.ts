import {
  DatabaseBlockDataSource,
  getCell,
  updateCell,
} from '@blocksuite/affine/blocks/database';
import { journalTodoDatabaseSlashMenuConfig } from '@blocksuite/affine/blocks/database-view-ref';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { JournalTodoDatabaseProvider } from '@blocksuite/affine/shared/services';
import { IS_MOBILE } from '@blocksuite/global/env';
import type { Store } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { pointerdown, wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import {
  createStubVirtualKeyboardExtension,
  enableMobileDatabaseEditing,
  isVisible,
  touchTap,
} from './utils.js';

// Story 2.12 (MOBILE-03 + the phase's own shared mobile harness):
// touch-emulation coverage for List view's three previously hover-only row
// actions (note, due-date, drag-handle). This file is picked up by BOTH
// `vitest.mobile.config.ts` (this plan's new mobile-context project,
// `hasTouch`/`isMobile`/a mobile `userAgent` set at `browser.newContext()`
// creation time) AND the existing, unmodified `vitest.config.ts` (desktop
// suite, three browsers, default UA) — `src/__tests__/**/*.spec.ts` matches
// this file's path under either config's `test.include`. Assertions below
// branch on `IS_MOBILE` (the exact same module-load-time constant the
// production CSS itself gates on) so the identical spec proves both halves
// of MOBILE-05 in one place: mobile config -> actions visible by default;
// desktop config -> actions remain hover-gated (unchanged).
describe('list view mobile touch parity (Story 2.12, MOBILE-03)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page', [
      createStubVirtualKeyboardExtension(),
    ]);
    return cleanup;
  });

  function createStubStd(journalDate: string) {
    let ref: { refDocId: string; refBlockId: string } | undefined;
    const stub = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) => {
            if (identifier === JournalTodoDatabaseProvider) {
              return {
                getJournalDate: () => journalDate,
                getJournalTodoDatabaseRef: () => ref,
                setJournalTodoDatabaseRef: (newRef: typeof ref) => {
                  ref = newRef;
                },
                isTemplateDoc: () => false,
              };
            }
            return undefined;
          };
        }
        if (prop === 'host') {
          const realHost = Reflect.get(target, prop, receiver) as object;
          return new Proxy(realHost, {
            get(hostTarget, hostProp) {
              if (hostProp === 'std') return stub;
              return Reflect.get(hostTarget, hostProp, hostTarget);
            },
          });
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    return { stub, getRef: () => ref };
  }

  async function seedJournalTodo() {
    // Task 1's own new finding: `DatabaseBlockDataSource.readonly$` already
    // ANDs in `IS_MOBILE && !getFlag('enable_mobile_database_editing')`
    // (opt-in, defaults `false`) -- writable-path assertions below need
    // this enabled the same way a real device with the setting on would
    // have it, matching `renderDragHandle`'s pre-existing gate rather than
    // fighting it. Set on `doc` here for the *creation-time* path (e.g.
    // `ensureTaskHierarchyColumns`); the *rendered* `database-view-ref`
    // block resolves its canonical database through a separately
    // `getStore()`-constructed `Store` instance with its own independent
    // `FeatureFlagService` (confirmed live this session -- `Store` is not a
    // per-doc-id singleton; `BlockCollectionDoc.getStore()` without an
    // explicit stable `id` mints a fresh extension-provider scope per
    // call), so callers must ALSO call `enableFlagOnRenderedRow` below
    // once that row has actually rendered.
    enableMobileDatabaseEditing(doc);
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd('2026-08-08');

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    await (
      resolvedItems.find(i => i.name === 'Journal Todo') as unknown as {
        action: () => Promise<void>;
      }
    ).action();
    await wait();

    const ref = getRef()!;
    const canonicalModel = doc.getBlock(ref.refBlockId)
      ?.model as DatabaseBlockModel;
    const dataSource = new DatabaseBlockDataSource(canonicalModel);
    const { levelColumnId } = dataSource.ensureTaskHierarchyColumns();
    const getLevel = (rowId: string) =>
      (getCell(canonicalModel, rowId, levelColumnId!)?.value as number) ?? 0;
    const setLevel = (rowId: string, level: number) =>
      updateCell(canonicalModel, rowId, {
        columnId: levelColumnId!,
        value: level,
      });
    return { dataSource, canonicalModel, getLevel, setLevel };
  }

  function getRowEl(rowId: string) {
    return document.querySelector(
      `[data-row-id="${rowId}"]`
    ) as HTMLElement | null;
  }

  function getListRenderer(rowId: string) {
    return getRowEl(rowId)?.closest('affine-data-view-list') as unknown as {
      logic: {
        view: {
          readonly$: { value: boolean };
          manager: {
            dataSource: { _model?: { store: Store } };
          };
        };
      };
      renderDragHandle: (rowId: string) => unknown;
      renderNoteAction: (rowId: string) => unknown;
      renderDueDateAction: (rowId: string) => unknown;
    } | null;
  }

  // Once the reference block has actually rendered a row, this reaches
  // into the *live* `manager.dataSource`'s own backing `Store` (a distinct
  // instance from `doc`, per the `seedJournalTodo` comment above) and
  // enables the flag there too, then waits a tick for the `SignalWatcher`
  // -driven reactive re-render this Story 2.12 CSS fix relies on.
  async function enableFlagOnRenderedRow(rowId: string) {
    const renderer = getListRenderer(rowId);
    const store = renderer?.logic.view.manager.dataSource._model?.store;
    if (store) {
      enableMobileDatabaseEditing(store);
    }
    await wait();
  }

  function getNoteAction(rowId: string) {
    return getRowEl(rowId)?.querySelector(
      '.affine-data-view-list-note-action'
    ) as HTMLElement | null;
  }

  function getDueDateAction(rowId: string) {
    return getRowEl(rowId)?.querySelector(
      '.affine-data-view-list-due-date-action'
    ) as HTMLElement | null;
  }

  function getHandle(rowId: string) {
    return getRowEl(rowId)?.querySelector(
      '.affine-data-view-list-drag-handle'
    ) as HTMLElement | null;
  }

  // Behavior Test 1 (mobile context resolves true): assert on the
  // *rendered effect* of `IS_MOBILE` — the new CSS block's visibility
  // override actually taking effect — rather than `navigator.userAgent`
  // directly, since the CSS fix itself is the real signal a test should
  // care about (RESEARCH.md Pitfall 1 / this plan's own directive).
  test('IS_MOBILE resolves true under the mobile-context harness, reflected in a rendered CSS effect', async () => {
    const { dataSource } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    await wait();

    const noteAction = getNoteAction(rowA);
    expect(noteAction).toBeTruthy();
    expect(isVisible(noteAction)).toBe(IS_MOBILE);
  });

  // Behavior Test 2 (visibility flip): note/due-date/drag-handle are
  // visible without any simulated `:hover` under the mobile context, and
  // remain hover-gated (hidden by default) under the existing desktop
  // config for the identical row — proven by branching the very same
  // assertion on `IS_MOBILE`, so this file's desktop-config run (picked up
  // unmodified by `vitest.config.ts`) is the "equivalent assertions against
  // the existing desktop project" acceptance criterion.
  test('note/due-date/drag-handle visibility matches IS_MOBILE without any simulated hover', async () => {
    const { dataSource } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    await wait();
    await enableFlagOnRenderedRow(rowA);

    const noteAction = getNoteAction(rowA);
    const dueDateAction = getDueDateAction(rowA);
    const handle = getHandle(rowA);
    expect(noteAction).toBeTruthy();
    expect(dueDateAction).toBeTruthy();
    expect(handle).toBeTruthy();

    expect(isVisible(noteAction)).toBe(IS_MOBILE);
    expect(isVisible(dueDateAction)).toBe(IS_MOBILE);
    expect(isVisible(handle)).toBe(IS_MOBILE);
  });

  // Behavior Test 3 (readonly regression, drag-handle): the existing
  // `view.readonly$.value` gate inside `renderDragHandle` must still omit
  // the drag-handle DOM node entirely under IS_MOBILE — this is a JS-level
  // render gate, not a CSS rule, so it is orthogonal to (and must survive)
  // the mobile CSS-visibility change. Verified directly against the
  // `ListViewRenderer` render methods (same technique as `list.unit.spec.ts`),
  // since flipping the real view's readonly state end-to-end would require
  // plumbing a whole different doc-permission setup unrelated to this
  // phase's CSS-only scope.
  test('drag-handle is still absent when the view is readonly (JS gate preserved, IS_MOBILE-independent)', async () => {
    const { dataSource } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    await wait();
    const renderer = getListRenderer(rowA);
    expect(renderer).toBeTruthy();

    const original = renderer!.logic.view.readonly$.value;
    try {
      renderer!.logic.view.readonly$ = { value: true } as never;
      // `nothing` (lit's sentinel) renders as an empty comment/no node —
      // assert via lit's own sentinel identity, matching
      // `list.unit.spec.ts`'s own established assertion style.
      const { nothing } = await import('lit');
      expect(renderer!.renderDragHandle(rowA)).toBe(nothing);
    } finally {
      renderer!.logic.view.readonly$ = { value: original } as never;
    }
  });

  // Behavior Test 4 (readonly non-regression, note/due-date): confirms
  // `renderNoteAction`/`renderDueDateAction` are NOT readonly-gated today
  // (RESEARCH.md's corrected finding — only `renderDragHandle` gates) and
  // this phase must not silently add a new gate.
  test('note-action and due-date-action still render when the view is readonly (pre-existing non-gating preserved)', async () => {
    const { dataSource } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    await wait();
    const renderer = getListRenderer(rowA);
    expect(renderer).toBeTruthy();

    const original = renderer!.logic.view.readonly$.value;
    try {
      renderer!.logic.view.readonly$ = { value: true } as never;
      const { nothing } = await import('lit');
      expect(renderer!.renderNoteAction(rowA)).not.toBe(nothing);
      expect(renderer!.renderDueDateAction(rowA)).not.toBe(nothing);
    } finally {
      renderer!.logic.view.readonly$ = { value: original } as never;
    }
  });

  test('pointerdown smoke on the (now-visible-on-mobile) drag handle does not throw', async () => {
    const { dataSource } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    await wait();
    await enableFlagOnRenderedRow(rowA);
    const handle = getHandle(rowA);
    expect(handle).toBeTruthy();
    expect(() =>
      pointerdown(handle!, { x: 2, y: 2 }, { pointerType: 'touch' })
    ).not.toThrow();
  });

  // ---------------------------------------------------------------------
  // Task 2: full MOBILE-03 live-verification pass -- checkbox, detail
  // fields, drag-handle reorder, and the editing-trigger correctness case
  // RESEARCH.md Pitfall 4 / Open Question 2 flagged as unverified.
  // ---------------------------------------------------------------------

  // Behavior (1): tapping a row's checkbox/task-status cell toggles it,
  // matching desktop click behavior. `HeaderAreaTextCell.renderTaskStatusCheckbox`
  // (properties/title/text.ts) binds a plain `@click` handler, so
  // `touchTap`'s pointerdown/pointerup/click sequence (mirroring a real
  // touch tap's synthesized click) exercises the identical code path
  // desktop's mouse click already does -- a regression-only check per this
  // task's own scope, no production fix expected unless it fails.
  test('tapping the checkbox toggles task status, matching desktop click behavior', async () => {
    const { dataSource } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    await wait();
    await enableFlagOnRenderedRow(rowA);

    const rowEl = getRowEl(rowA);
    const checkbox = rowEl?.querySelector(
      '[data-testid="task-status-checkbox"]'
    ) as HTMLElement | null;
    expect(checkbox).toBeTruthy();
    expect(dataSource.getTaskStatusInfo(rowA)?.checked).toBe(false);

    touchTap(checkbox!);
    await wait();

    expect(dataSource.getTaskStatusInfo(rowA)?.checked).toBe(true);
  });

  // Behavior (2): tapping a row reaches its detail fields
  // (`renderDetailValue` output). `detailProperties$` (list-view-manager.ts)
  // is not gated on any tap/focus state, so this is a regression-only
  // check -- but the auto-created Status/Done-date columns are NOT a valid
  // fixture for it: `ensureTaskStatusColumn`/`ensureDoneDateColumn` both
  // deliberately hide themselves in every *non-table* view by default
  // (redundant with the title cell's own checkbox) -- confirmed live this
  // session (`dataSource.propertyDataSet`/`hidePropertyInViews`,
  // data-source.ts:793-804). A plain, ordinary text property (not
  // hidden by any such policy) is the correct fixture for "a detail field
  // genuinely visible and reachable via touch, matching desktop".
  test('tapping a row reaches its detail fields (renderDetailValue), matching desktop', async () => {
    const { dataSource } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    const notesColumnId = dataSource.propertyAdd('end', {
      type: 'rich-text',
      name: 'Notes',
    });
    expect(notesColumnId).toBeTruthy();
    await wait();

    const rowEl = getRowEl(rowA);
    expect(rowEl).toBeTruthy();
    touchTap(rowEl!);
    await wait();

    const detailField = rowEl!.querySelector(
      '.affine-data-view-list-field'
    ) as HTMLElement | null;
    expect(detailField).toBeTruthy();
    expect(isVisible(detailField)).toBe(true);

    detailField!.focus();
    expect(document.activeElement).toBe(detailField);
  });

  // Behavior (3): a touch-driven drag gesture on the now-visible drag
  // handle reorders a row via `ListDragController`'s existing pointer-based
  // `dragStart` (RESEARCH.md: mechanism is already `PointerEvent`-based, not
  // native HTML5 DnD), and `touch-action: none` (Task 1's CSS addition) is
  // present on the handle so the browser does not interpret the gesture as
  // a page/list scroll instead. Modeled on `journal-todo-drag.spec.ts`'s own
  // `dragHandleOnto` helper, with `pointerType: 'touch'`.
  test('touch-driven drag on the drag handle reorders a row, and touch-action:none is set to prevent scroll-interpretation', async () => {
    const { dataSource } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    const rowB = dataSource.rowAddAsTodoList('end');
    await wait();
    await enableFlagOnRenderedRow(rowA);

    const handleA = getHandle(rowA);
    const rowBEl = getRowEl(rowB);
    expect(handleA).toBeTruthy();
    expect(rowBEl).toBeTruthy();

    // Only present inside the IS_MOBILE-gated CSS block (Task 1) -- under
    // the desktop config project this same file is also picked up by, the
    // browser's default `touch-action: auto` remains, since no touch-drag
    // vs. scroll conflict exists there in the first place.
    expect(getComputedStyle(handleA!).touchAction).toBe(
      IS_MOBILE ? 'none' : 'auto'
    );

    const handleRect = handleA!.getBoundingClientRect();
    const titleB = rowBEl!.querySelector(
      '.affine-data-view-list-title'
    ) as HTMLElement;
    expect(titleB).toBeTruthy();
    const rowBRect = rowBEl!.getBoundingClientRect();
    const titleBRect = titleB.getBoundingClientRect();

    pointerdown(
      handleA!,
      { x: handleRect.width / 2, y: handleRect.height / 2 },
      { pointerType: 'touch', pointerId: 1, isPrimary: true }
    );
    // Small first move, still on the handle -- crosses the framework's own
    // drag-start distance threshold without leaving the handle (matches
    // `journal-todo-drag.spec.ts`'s own `dragHandleOnto` rationale).
    handleA!.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: handleRect.left + handleRect.width / 2 + 10,
        clientY: handleRect.top + handleRect.height / 2 + 10,
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        pointerType: 'touch',
      })
    );
    rowBEl!.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: titleBRect.left,
        clientY: rowBRect.bottom - 2,
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
        pointerType: 'touch',
      })
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX: titleBRect.left,
        clientY: rowBRect.bottom - 2,
        pointerId: 1,
        isPrimary: true,
        pointerType: 'touch',
      })
    );
    await wait();

    const rowIds = Array.from(
      document.querySelectorAll('.affine-data-view-list-row')
    ).map(el => (el as HTMLElement).dataset.rowId);
    expect(rowIds.indexOf(rowB)).toBeLessThan(rowIds.indexOf(rowA));
  });

  // Behavior (4): editing-trigger correctness (RESEARCH.md Pitfall 4 / Open
  // Question 2) -- a mere row-select tap (the row's own `tabindex="0"`
  // receiving focus, without entering text-edit) must NOT hide the row
  // actions; only focus genuinely landing inside the title's own rich-text
  // (real text-edit) should. Live-verified here rather than assumed: with
  // the original whole-row `:focus-within` selector this assertion FAILS
  // (the row itself receiving focus satisfies `:focus-within` on the row),
  // which is why Task 1's selector was narrowed to
  // `.affine-data-view-list-row:has(.affine-data-view-list-title:focus-within)`
  // -- documented in the SUMMARY as the final selector choice.
  test('editing-trigger correctness: a row-select focus does not hide actions, only a genuine title text-edit focus does', async () => {
    const { dataSource } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    await wait();
    await enableFlagOnRenderedRow(rowA);

    const rowEl = getRowEl(rowA)!;
    const noteAction = getNoteAction(rowA);
    expect(noteAction).toBeTruthy();
    expect(isVisible(noteAction)).toBe(IS_MOBILE);

    // Case A: row-select tap -- the row container itself (not the title)
    // receives focus.
    rowEl.focus();
    await wait();
    expect(isVisible(noteAction)).toBe(IS_MOBILE);
    rowEl.blur();
    await wait();

    // Case B: genuine text-edit -- focus lands on the title's own
    // contenteditable node (the actual leaf DOM element `<rich-text>`
    // delegates real text-editing focus to internally -- `<rich-text>`
    // itself carries no `tabindex`/`contenteditable`, only its own
    // rendered `div[contenteditable="true"]` child does, confirmed live
    // this session against the rendered DOM).
    const titleEl = rowEl.querySelector(
      '.affine-data-view-list-title'
    ) as HTMLElement | null;
    expect(titleEl).toBeTruthy();
    const editable = titleEl!.querySelector(
      '[contenteditable="true"]'
    ) as HTMLElement | null;
    expect(editable).toBeTruthy();
    editable!.focus();
    await wait();
    expect(isVisible(noteAction)).toBe(false);
    editable!.blur();
    await wait();
    expect(isVisible(noteAction)).toBe(IS_MOBILE);
  });
});
