import {
  DatabaseBlockDataSource,
  getCell,
  updateCell,
} from '@blocksuite/affine/blocks/database';
import {
  journalTodoDatabaseSlashMenuConfig,
  journalTodoSourceSlashMenuConfig,
} from '@blocksuite/affine/blocks/database-view-ref';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { JournalTodoDatabaseProvider } from '@blocksuite/affine/shared/services';
import { beforeEach, describe, expect, test } from 'vitest';

import { pointerdown, wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

// Story 2.8: real, pointer-driven drag verification for Journal Todo's
// list view — matches `journal-todo-database.spec.ts`'s own setup pattern
// (a stubbed `JournalTodoDatabaseProvider` invoking the real
// `journalTodoDatabaseSlashMenuConfig` "Journal Todo" action), since the
// unit tests already cover the indent-level clamping algorithm in
// isolation with mocked rects — this file exercises the actual rendered
// DOM, real `getBoundingClientRect()` measurements, and real pointer
// events end-to-end.
describe('journal todo list view row drag (Story 2.8)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
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
                // Story 2.11: not a template doc in this suite.
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
              // Story 2.11: `hostTarget`, not `hostReceiver` — see the
              // identical fix/comment in `journal-todo-database.spec.ts`'s
              // own `createStubStd`.
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
    // Directly writes the level cell rather than going through
    // `setPendingHierarchyLevel` + `rowMove` — the pending-level trick only
    // takes effect when `rowMove` actually resolves a *different* target
    // index than the row's current one; a row already positioned right
    // after its intended parent is a no-op move (see `rowMove`'s own
    // `if (target?.id === rowId) return;` early exit), so it would never
    // apply. This helper is purely for test setup, establishing hierarchy
    // state to then verify the drag itself preserves.
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

  function getHandle(rowId: string) {
    return getRowEl(rowId)?.querySelector(
      '.affine-data-view-list-drag-handle'
    ) as HTMLElement | null;
  }

  // Two departures from `utils/common.ts`'s own `drag()` helper, both
  // needed for this controller specifically:
  //
  // 1. The framework's own `DragController` (`framework/std/src/event/
  //    control/pointer.ts`) only synthesizes its internal `dragStart`
  //    event once a pointermove crosses `isFarEnough` from the initial
  //    `pointerdown` — and that *first* crossing move is consumed
  //    internally as the drag's start event, never reaching this
  //    controller's own `onMove`. A single jump-straight-to-target move
  //    (as `drag()` would produce if pointed at a distant element) crosses
  //    the threshold but never produces a *second* move for `onMove` to
  //    see. A small first move near the handle satisfies the threshold
  //    without wasting the real destination coordinates.
  // 2. `drag()` dispatches every move on the SAME element the drag started
  //    on — real browsers hit-test pointer events at their actual screen
  //    coordinates, but a synthetic `element.dispatchEvent(...)` always
  //    resolves `event.target` to the element it was called on, regardless
  //    of `clientX`/`clientY`. Since the controller determines the hover
  //    target via `evt.target.closest(...)` (matching table view's own
  //    established pattern), the real destination move must be dispatched
  //    directly on the row actually being hovered.
  function dragHandleOnto(
    handle: HTMLElement,
    target: HTMLElement,
    clientX: number,
    clientY: number
  ) {
    const handleRect = handle.getBoundingClientRect();
    pointerdown(handle, {
      x: handleRect.width / 2,
      y: handleRect.height / 2,
    });
    // Small first move, still on the handle — crosses the framework's own
    // drag-start distance threshold without leaving the handle.
    handle.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX: handleRect.left + handleRect.width / 2 + 10,
        clientY: handleRect.top + handleRect.height / 2 + 10,
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
      })
    );
    target.dispatchEvent(
      new PointerEvent('pointermove', {
        clientX,
        clientY,
        bubbles: true,
        pointerId: 1,
        isPrimary: true,
      })
    );
    window.dispatchEvent(
      new PointerEvent('pointerup', {
        clientX,
        clientY,
        pointerId: 1,
        isPrimary: true,
      })
    );
  }

  test("dragging a row down past a sibling reorders it as a sibling, matching table view's vertical logic (AC4/AC5 zero-offset case)", async () => {
    const { dataSource, getLevel } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    const rowB = dataSource.rowAddAsTodoList('end');
    await wait();

    const handleA = getHandle(rowA);
    const rowBEl = getRowEl(rowB);
    const titleB = rowBEl?.querySelector(
      '.affine-data-view-list-title'
    ) as HTMLElement | null;
    expect(handleA).toBeTruthy();
    expect(rowBEl).toBeTruthy();
    expect(titleB).toBeTruthy();

    const rowBRect = rowBEl!.getBoundingClientRect();
    const titleBRect = titleB!.getBoundingClientRect();
    // Drop in row-b's lower half, at row-b's own title x (zero horizontal
    // offset) — should land as a sibling right after row-b, not nested.
    dragHandleOnto(handleA!, rowBEl!, titleBRect.left, rowBRect.bottom - 2);
    await wait();

    const rowIds = Array.from(
      document.querySelectorAll('.affine-data-view-list-row')
    ).map(el => (el as HTMLElement).dataset.rowId);
    expect(rowIds.indexOf(rowB)).toBeLessThan(rowIds.indexOf(rowA));
    expect(getLevel(rowA)).toBe(0);
    expect(getLevel(rowB)).toBe(0);
  });

  test("dragging right past the indent threshold nests the row as the reference row's child (AC5)", async () => {
    const { dataSource, getLevel } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    const rowB = dataSource.rowAddAsTodoList('end');
    await wait();

    const handleA = getHandle(rowA);
    const rowBEl = getRowEl(rowB);
    const titleB = rowBEl?.querySelector(
      '.affine-data-view-list-title'
    ) as HTMLElement | null;
    expect(handleA).toBeTruthy();
    expect(titleB).toBeTruthy();

    const rowBRect = rowBEl!.getBoundingClientRect();
    const titleBRect = titleB!.getBoundingClientRect();
    // Drop in row-b's lower half, 40px right of row-b's own title start —
    // past the 24px threshold, so row-a should nest as row-b's child.
    dragHandleOnto(
      handleA!,
      rowBEl!,
      titleBRect.left + 40,
      rowBRect.bottom - 2
    );
    await wait();

    expect(getLevel(rowA)).toBe(1);
  });

  test('dragging left of the reference row promotes a nested row back out to the top level (AC5)', async () => {
    const { dataSource, getLevel, setLevel } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    // Needed only so row-b isn't already adjacent to row-a — see the
    // comment below on why that matters for `rowMove`.
    dataSource.rowAddAsTodoList('end');
    const rowB = dataSource.rowAddAsTodoList('end');
    setLevel(rowB, 1);
    await wait();
    expect(getLevel(rowB)).toBe(1);

    const handleB = getHandle(rowB);
    const rowAEl = getRowEl(rowA);
    const titleA = rowAEl?.querySelector(
      '.affine-data-view-list-title'
    ) as HTMLElement | null;
    expect(handleB).toBeTruthy();
    expect(titleA).toBeTruthy();

    const rowARect = rowAEl!.getBoundingClientRect();
    const titleARect = titleA!.getBoundingClientRect();
    // row-b starts as the 3rd row (after row-a, row-c); dropping it right
    // after row-a is a genuine position change (not a same-position no-op,
    // which `rowMove` itself short-circuits before ever recomputing
    // hierarchy metadata — see this test file's sibling "subtree" test for
    // the same gotcha in setup). Well to the *left* of row-a's own title
    // start clamps the level to 0, so the previously-nested row-b lands as
    // row-a's sibling, promoted back out.
    dragHandleOnto(
      handleB!,
      rowAEl!,
      Math.max(0, titleARect.left - 100),
      rowARect.bottom - 2
    );
    await wait();

    const rowIds = Array.from(
      document.querySelectorAll('.affine-data-view-list-row')
    ).map(el => (el as HTMLElement).dataset.rowId);
    expect(rowIds.indexOf(rowB)).toBe(rowIds.indexOf(rowA) + 1);
    expect(getLevel(rowB)).toBe(0);
  });

  test('dragging a parent row carries its child subtree along (AC7)', async () => {
    const { dataSource, getLevel, setLevel } = await seedJournalTodo();
    const parent = dataSource.rowAddAsTodoList('end');
    const child = dataSource.rowAddAsTodoList('end');
    setLevel(child, 1);
    const other = dataSource.rowAddAsTodoList('end');
    await wait();

    expect(getLevel(parent)).toBe(0);
    expect(getLevel(child)).toBe(1);
    expect(getLevel(other)).toBe(0);

    const handleParent = getHandle(parent);
    const otherEl = getRowEl(other);
    const titleOther = otherEl?.querySelector(
      '.affine-data-view-list-title'
    ) as HTMLElement | null;
    expect(handleParent).toBeTruthy();
    expect(otherEl).toBeTruthy();
    expect(titleOther).toBeTruthy();

    const otherRect = otherEl!.getBoundingClientRect();
    const titleOtherRect = titleOther!.getBoundingClientRect();
    // Move the parent row to after `other` (zero horizontal offset from
    // `other`'s own title start, staying a sibling) — its child should
    // move along with it.
    dragHandleOnto(
      handleParent!,
      otherEl!,
      titleOtherRect.left,
      otherRect.bottom - 2
    );
    await wait();

    const rowIds = Array.from(
      document.querySelectorAll('.affine-data-view-list-row')
    ).map(el => (el as HTMLElement).dataset.rowId);
    const parentIndex = rowIds.indexOf(parent);
    const childIndex = rowIds.indexOf(child);
    expect(childIndex).toBe(parentIndex + 1);
    expect(getLevel(parent)).toBe(0);
    expect(getLevel(child)).toBe(1);
  });

  // AC9's readonly-gating logic itself (`renderDragHandle` returning
  // `nothing` once `view.readonly$.value` is true) is already directly
  // unit-tested against the render method in `list.unit.spec.ts` — this
  // suite instead confirms the handle renders (and drag genuinely works)
  // in the normal, writable case, which is what the drag scenarios above
  // already exercise end-to-end.
  test('the drag handle renders for a writable, todo-capable view', async () => {
    const { dataSource } = await seedJournalTodo();
    const rowA = dataSource.rowAddAsTodoList('end');
    await wait();

    expect(getHandle(rowA)).toBeTruthy();
  });

  // Regression guard for Story 2.5.5's own carryover slash-menu item —
  // confirms this new controller doesn't interfere with an unrelated
  // Journal Todo item still resolving correctly.
  test('journal todo source selection item is still offered alongside the drag-enabled list view', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub } = createStubStd('2026-08-08');
    const items = journalTodoSourceSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    expect(resolvedItems.length).toBeGreaterThan(0);
  });
});
