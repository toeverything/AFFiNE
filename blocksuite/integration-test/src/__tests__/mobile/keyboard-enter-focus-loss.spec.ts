import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import {
  createStubVirtualKeyboardExtension,
  enableMobileDatabaseEditing,
} from './utils.js';

// .planning/debug/keyboard-enter-focus-loss.md
//
// User-confirmed regression: pressing Enter on a Journal Todo row used to
// keep the on-screen keyboard open and editing context intact (true before
// the 4-commit chain ed7070f745/6c7ae7a398/6c8b514fc5/bc74d3e60a), but no
// longer does, even after all four fixes. The debug file's leading
// hypothesis (the in-flow keyboard-avoidance spacer entangling with
// scroll-into-view) does NOT hold up under static reading:
// `affine-keyboard-toolbar` is `position: fixed` (styles.ts) -- its own
// in-flow spacer child only repositions content WITHIN that fixed box; a
// `position: fixed` element is removed from its containing block's normal
// flow, so the spacer's height changes cannot affect the editor's own
// scrollable content layout/extent at all. That mechanism is falsified
// directly below (Task 0) before pursuing the real one.
//
// The real, still-uncovered gap traced by static reading of the current
// (post-bc74d3e60a) code: `ListViewRenderer.focusRowTitle`'s attempt-0
// synchronous flush (`this.requestUpdate(); this.performUpdate();`) only
// forces *this* component's own pending Lit update. For a genuinely NEW
// row (never rendered before), the row's title cell is a SEPARATE
// LitElement chain -- `<uni-lit>` (mount() runs synchronously from its own
// `connectedCallback`, appending a fresh `HeaderAreaTextCell` instance) ->
// `HeaderAreaTextCell` (a `ShadowlessElement`/LitElement whose OWN first
// `render()` -- the one that actually creates the `<rich-text>` element
// carrying the real contenteditable `inlineEditor` -- is scheduled on
// Lit's default microtask scheduler, NOT flushed by the outer
// `performUpdate()` call, which only flushes `ListViewRenderer`'s own
// template). So on attempt 0, `titleCell` (`data-view-header-area-text`)
// exists in the DOM (synchronously appended), but `titleCell.inlineEditor`
// is still `undefined` (its `<rich-text>` child hasn't been created yet) --
// `row?.focus()` therefore leaves DOM focus on the plain, NON-editable
// outer row `<div>` (it has `tabindex="0")` but no `contenteditable`),
// which cannot summon a mobile OS keyboard. The code always falls through
// to the `Promise.resolve()` microtask retry for a brand new row -- which
// round 2 of `keyboard-focus-tabbar-coordination.md` already established
// does NOT reliably preserve iOS's keyboard-summon gesture window either.

type InlineEditorLike = {
  setInlineRange: (range: { index: number; length: number }) => void;
  getInlineRange: () => { index: number; length: number } | null;
};

type RichTextElement = HTMLElement & {
  inlineEditor?: InlineEditorLike;
};

async function seedListView(rowCount: number) {
  enableMobileDatabaseEditing(doc);
  const noteId = addNote(doc);
  const databaseId = doc.addBlock('affine:database', {}, noteId);
  await wait();

  const dbModel = doc.getModelById(databaseId) as DatabaseBlockModel;
  const dataSource = new DatabaseBlockDataSource(dbModel);

  const rowIds: string[] = [];
  for (let i = 0; i < rowCount; i++) {
    rowIds.push(dataSource.rowAddAsTodoList('end'));
  }
  await wait();

  const dbEl = document.querySelector(
    `affine-database[data-block-id="${databaseId}"]`
  ) as HTMLElement & {
    dataSource: {
      value: {
        viewManager: {
          viewAdd: (t: string) => string;
          setCurrentView: (id: string) => void;
        };
      };
    };
  };
  const listViewId = dbEl.dataSource.value.viewManager.viewAdd('list');
  dbEl.dataSource.value.viewManager.setCurrentView(listViewId);
  await wait(500);

  return { dataSource, dbModel, dbEl, rowIds };
}

function getRowEl(dbEl: HTMLElement, rowId: string) {
  return dbEl.querySelector(
    `.affine-data-view-list-row[data-row-id="${rowId}"]`
  ) as HTMLElement;
}

async function focusRowAt(rowEl: HTMLElement, index: number) {
  const richText = rowEl.querySelector('rich-text') as RichTextElement | null;
  expect(richText).toBeTruthy();
  const withUpdateComplete = richText as unknown as {
    updateComplete: Promise<boolean>;
  };
  await withUpdateComplete.updateComplete;
  const inlineEditor = richText!.inlineEditor;
  expect(inlineEditor).toBeTruthy();
  inlineEditor!.setInlineRange({ index, length: 0 });
  await wait();
  return richText!;
}

function dispatchKey(
  target: HTMLElement,
  key: string,
  opts: Partial<KeyboardEventInit> = {}
) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      composed: true,
      cancelable: true,
      ...opts,
    })
  );
}

describe('keyboard-enter-focus-loss: Enter on a Journal Todo row keeps real DOM focus (and therefore the on-screen keyboard) in the new row', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page', [
      createStubVirtualKeyboardExtension(),
    ]);
    return cleanup;
  });

  // Task 0: directly falsifies the debug file's leading hypothesis before
  // relying on it. `affine-keyboard-toolbar` is `position: fixed` (styles.ts)
  // -- changing its in-flow spacer child's height must NOT change the
  // editor's own scrollable content height, since a fixed-position element
  // (and everything inside it) is removed from its containing block's
  // normal document flow entirely.
  test('the keyboard-toolbar in-flow spacer changing height does not affect document scroll height (falsifies the leading hypothesis)', async () => {
    const { FeatureFlagService } =
      await import('@blocksuite/affine/shared/services');
    doc.get(FeatureFlagService).setFlag('enable_mobile_keyboard_toolbar', true);

    const { TextSelection } = await import('@blocksuite/std');
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const selection = editor.std.selection.create(TextSelection, {
      from: { blockId: paragraphId, index: 0, length: 0 },
      to: null,
    });
    editor.std.selection.setGroup('note', [selection]);
    editor.std.event.active = true;
    await wait();

    const host = document.querySelector<HTMLElement>('affine-keyboard-toolbar');
    expect(host).toBeTruthy();
    const keyboard = (
      host as unknown as {
        keyboard: {
          visible$: { value: boolean };
          height$: { value: number };
        };
      }
    ).keyboard;

    keyboard.visible$.value = true;
    keyboard.height$.value = 60;
    await wait();
    const scrollHeightSmall = document.documentElement.scrollHeight;

    keyboard.height$.value = 600;
    await wait();
    const scrollHeightLarge = document.documentElement.scrollHeight;

    expect(scrollHeightLarge).toBe(scrollHeightSmall);
  });

  test("pressing Enter on an empty root-level row leaves document.activeElement inside the newly created row's real contenteditable, synchronously (no microtask/await needed) -- not stuck on the non-editable outer row <div>", async () => {
    const { dbEl, rowIds } = await seedListView(1);
    const [row1] = rowIds;

    const row1El = getRowEl(dbEl, row1);
    await focusRowAt(row1El, 0);
    expect(row1El.contains(document.activeElement)).toBe(true);

    // Real trusted keydown synchronously creates the new row (LIST-04) and
    // calls focusRowTitle(newRowId). Check activeElement IMMEDIATELY, no
    // `await` in between -- this is exactly the call-stack window a real
    // mobile WebKit `.focus()` needs to stay within to re-summon the OS
    // keyboard (see keyboard-focus-tabbar-coordination.md).
    dispatchKey(row1El, 'Enter');

    const activeEl = document.activeElement;
    const activeRow = (activeEl as HTMLElement | null)?.closest<HTMLElement>(
      '.affine-data-view-list-row'
    );
    expect(activeRow).toBeTruthy();
    expect(activeRow?.dataset.rowId).not.toBe(row1);

    // The critical assertion: focus must NOT be stuck on the new row's own
    // plain, non-editable outer <div> (tabindex="0" but no contenteditable)
    // -- that state cannot summon a mobile OS keyboard even though DOM
    // focus technically "succeeded".
    expect(activeEl).not.toBe(activeRow);
  });
});
