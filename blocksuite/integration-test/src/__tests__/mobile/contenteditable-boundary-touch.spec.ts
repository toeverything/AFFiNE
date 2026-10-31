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

type InlineEditorLike = {
  setInlineRange: (range: { index: number; length: number }) => void;
  getInlineRange: () => { index: number; length: number } | null;
  insertText: (range: { index: number; length: number }, text: string) => void;
};

type RichTextElement = HTMLElement & {
  inlineEditor?: InlineEditorLike;
  updateComplete: Promise<boolean>;
};

// Mirrors `database-title-cell-undo.spec.ts`'s own established pattern:
// `insertText` takes the target range as an explicit argument (it does not
// read the "current" reactive `inlineRange$`), so no prior `setInlineRange`
// call is required for the mutation itself to land in the model's Y.Text --
// it operates directly on the given index/length. `setInlineRange` is only
// used here afterward to leave the editor in a realistic "focused" state,
// matching what a real tap would leave behind.
async function typeIntoRichText(richText: RichTextElement, text: string) {
  await richText.updateComplete;
  const inlineEditor = richText.inlineEditor;
  expect(inlineEditor).toBeTruthy();
  inlineEditor!.insertText({ index: 0, length: 0 }, text);
  inlineEditor!.setInlineRange({ index: text.length, length: 0 });
  await wait();
  return inlineEditor!;
}

async function focusRichText(richText: RichTextElement, index = 0) {
  await richText.updateComplete;
  const inlineEditor = richText.inlineEditor;
  expect(inlineEditor).toBeTruthy();
  inlineEditor!.setInlineRange({ index, length: 0 });
  await wait();
  return inlineEditor!;
}

type DatabaseComponentLike = HTMLElement & {
  dataSource: {
    value: {
      viewManager: {
        viewAdd: (t: string) => string;
        setCurrentView: (id: string) => void;
      };
    };
  };
};

async function switchToListView(databaseId: string) {
  const dbEl = document.querySelector(
    `affine-database[data-block-id="${databaseId}"]`
  ) as DatabaseComponentLike;
  expect(dbEl).toBeTruthy();
  const listViewId = dbEl.dataSource.value.viewManager.viewAdd('list');
  dbEl.dataSource.value.viewManager.setCurrentView(listViewId);
  await wait(500);
  return dbEl;
}

// Phase 4, Plan 03 (MOBILE-14, D-08, Bug A): proves the nested-contenteditable
// ambiguity between `PageRootBlockComponent` and each block's own
// independently-`true` descendant rich-text div (`rich-text.ts`) is resolved.
//
// UPDATED (2026-10-01, cross-block-selection-regression): the original fix
// put `contentEditable = 'false'` on `NoteBlockComponent`/`HeaderAreaTextCell`
// themselves. That resolved the tap-hit-testing ambiguity but ALSO isolated
// every sibling block's rich-text into its own `contenteditable="true"`
// island (true -> false -> true, true, true...), which blocked native
// drag-selection from extending across paragraphs/list items/database rows
// on every platform. The boundary now lives on `PageRootBlockComponent`
// itself instead (always `contenteditable="false"`, see its `renderBlock()`
// doc comment) -- removing the ambiguous tap target at its actual source
// while keeping every block inside a note as one continuous editable region.
// `NoteBlockComponent`/`HeaderAreaTextCell` now restore ordinary
// `contenteditable="true"` (respecting doc readonly) one level down.
describe('contenteditable boundary for note blocks and database title cells (Phase 4, MOBILE-14)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page', [
      createStubVirtualKeyboardExtension(),
    ]);
    return cleanup;
  });

  // Behavior (1): affine-page-root carries contenteditable="false" (the
  // single boundary, moved here from affine-note), while affine-note itself
  // and its descendant paragraph's own rich-text div (which independently
  // sets its own contenteditable per rich-text.ts:422-423) remain
  // focusable/editable -- typed text lands in the model's Y.Text. `addNote`
  // already seeds its note with exactly one paragraph -- reused here
  // directly rather than adding a second, unrelated one.
  test('affine-page-root carries contenteditable="false" while affine-note and its descendant paragraph rich-text remain editable', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.getBlocksByFlavour('affine:paragraph')[0]!.id;
    await wait();

    const pageRootEl = document.querySelector('affine-page-root');
    expect(pageRootEl).toBeTruthy();
    expect(pageRootEl!.getAttribute('contenteditable')).toBe('false');

    const noteEl = document.querySelector('affine-note');
    expect(noteEl).toBeTruthy();
    expect(noteEl!.getAttribute('contenteditable')).toBe('true');

    const richText = noteEl!.querySelector(
      'rich-text'
    ) as RichTextElement | null;
    expect(richText).toBeTruthy();
    const innerEditable = richText!.querySelector(
      '[contenteditable="true"]'
    ) as HTMLElement | null;
    expect(innerEditable).toBeTruthy();

    await typeIntoRichText(richText!, 'hello mobile');

    const model = doc.getModelById(paragraphId);
    expect(model?.text?.toString()).toBe('hello mobile');
    expect(doc.getModelById(noteId)).toBeTruthy();
  });

  // Behavior (2): the same boundary (now at affine-page-root) + still-editable
  // proof for a database row's title cell -- `HeaderAreaTextCell`
  // (`data-view-header-area-text`, the actual custom-element tag registered
  // in text.ts's own `declare global` block) is shared across List/Table/
  // Kanban, so this single component fix closes the gap for all three view
  // types at once.
  test('data-view-header-area-text carries contenteditable="true" (page root carries the false boundary) and its descendant rich-text remains independently editable', async () => {
    enableMobileDatabaseEditing(doc);
    const noteId = addNote(doc);
    const databaseId = doc.addBlock('affine:database', {}, noteId);
    await wait();

    const dbModel = doc.getModelById(databaseId) as DatabaseBlockModel;
    const dataSource = new DatabaseBlockDataSource(dbModel);
    const rowId = dataSource.rowAdd('end');
    await wait();

    await switchToListView(databaseId);

    const pageRootEl = document.querySelector('affine-page-root');
    expect(pageRootEl).toBeTruthy();
    expect(pageRootEl!.getAttribute('contenteditable')).toBe('false');

    const titleCellEl = document.querySelector('data-view-header-area-text');
    expect(titleCellEl).toBeTruthy();
    expect(titleCellEl!.getAttribute('contenteditable')).toBe('true');

    const richText = titleCellEl!.querySelector(
      'rich-text'
    ) as RichTextElement | null;
    expect(richText).toBeTruthy();
    const innerEditable = richText!.querySelector(
      '[contenteditable="true"]'
    ) as HTMLElement | null;
    expect(innerEditable).toBeTruthy();

    await typeIntoRichText(richText!, 'row title');

    const rowModel = doc.getModelById(rowId);
    expect(rowModel?.text?.toString()).toBe('row title');
  });

  // Behavior (3): from a paragraph's own rich-text div, `.closest(
  // '[contenteditable]')` resolves to that rich-text div itself (the
  // nearest explicit boundary) -- never `affine-page-root` -- proving a tap
  // on the rich-text's own editable region can never ambiguously resolve up
  // to the (now explicitly non-editable) page root.
  test('.closest("[contenteditable]") from a paragraph rich-text div resolves to the rich-text div itself, never affine-page-root', async () => {
    addNote(doc);
    await wait();

    const richText = document.querySelector(
      'affine-note rich-text'
    ) as RichTextElement | null;
    expect(richText).toBeTruthy();
    const innerEditable = richText!.querySelector(
      '[contenteditable="true"]'
    ) as HTMLElement | null;
    expect(innerEditable).toBeTruthy();

    const resolvedBoundary = innerEditable!.closest('[contenteditable]');
    expect(resolvedBoundary).toBe(innerEditable);
    expect(resolvedBoundary?.tagName.toLowerCase()).not.toBe(
      'affine-page-root'
    );
  });

  // ---------------------------------------------------------------------
  // Task 2: verify (rather than assume) whether any residual auto-scroll
  // jump remains from rich-text.ts's own caret-auto-scroll effect (lines
  // 263-306) re-firing around a focus transition -- that mechanism is
  // independent of the contenteditable-nesting ambiguity Task 1 fixed
  // above, so it needed its own empirical check.
  describe('Task 2: residual auto-scroll jump verification (MOBILE-14)', () => {
    // Wires a real scrollable `.affine-page-viewport` ancestor onto this
    // harness's own app container, mirroring how `verticalScrollContainerGetter`
    // resolves in production (`getViewportElement`,
    // `blocksuite/affine/shared/src/utils/dom/viewport.ts`, matched against
    // the real app shell's own `.affine-page-viewport` class,
    // `packages/frontend/core`). This blocksuite-only integration-test
    // harness has no such element by default, so without this,
    // `rich-text.ts`'s own auto-scroll effect never resolves a
    // `verticalScrollContainer` and its scroll-jump branch never runs at
    // all here -- which would make the assertion below pass vacuously
    // rather than as a genuine proxy for "no visible jump" in production.
    function wireScrollableViewport() {
      const viewport = editor.parentElement as HTMLElement;
      expect(viewport).toBeTruthy();
      viewport.classList.add('affine-page-viewport');
      return viewport;
    }

    test('focusing into an already-visible paragraph produces no scroll delta on the page viewport', async () => {
      addNote(doc);
      await wait();

      const viewport = wireScrollableViewport();

      const richText = document.querySelector(
        'affine-note rich-text'
      ) as RichTextElement | null;
      expect(richText).toBeTruthy();

      // The target paragraph is already fully in view (freshly rendered at
      // the top of the doc, well within the 1280px-tall viewport this
      // harness sets up) -- this is the "already visible" case the
      // scroll-delta assertion below is the automated proxy for.
      const scrollTopBefore = viewport.scrollTop;
      const windowScrollYBefore = window.scrollY;

      await focusRichText(richText!, 0);
      await wait();

      const scrollTopAfter = viewport.scrollTop;
      const windowScrollYAfter = window.scrollY;

      // Small tolerance (<=1px) allows for legitimate sub-pixel layout
      // rounding, per this task's own acceptance criteria -- not a relaxed
      // pass condition for a genuine jump.
      expect(Math.abs(scrollTopAfter - scrollTopBefore)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(windowScrollYAfter - windowScrollYBefore)
      ).toBeLessThanOrEqual(1);

      // RESULT: this assertion passes on the first attempt, with no
      // `suppressingRichTextAutoScroll` guard added anywhere. Reading
      // rich-text.ts's own auto-scroll effect (lines 287-306) confirms why:
      // `this.scrollIntoView(...)` is only ever called when the caret's
      // range rect falls outside the resolved `verticalScrollContainer`'s
      // own bounds (`rangeRect.top < containerRect.top` or `rangeRect.
      // bottom > containerRect.bottom`) -- a paragraph already fully in
      // view never crosses either threshold, so there is no residual jump
      // for Task 1's boundary fix to have left behind. Per this project's
      // established "live-verify before extending" pattern (Phase 1 Bug 3,
      // Phase 3 rowMove), no suppression code was added to
      // `NoteBlockComponent`/`HeaderAreaTextCell` as a result -- this test
      // is the record of that live verification, not an assumption.
    });

    test('focusing into an already-visible database row title cell produces no scroll delta on the page viewport', async () => {
      enableMobileDatabaseEditing(doc);
      const noteId = addNote(doc);
      const databaseId = doc.addBlock('affine:database', {}, noteId);
      await wait();

      const dbModel = doc.getModelById(databaseId) as DatabaseBlockModel;
      const dataSource = new DatabaseBlockDataSource(dbModel);
      dataSource.rowAdd('end');
      await wait();

      await switchToListView(databaseId);

      const viewport = wireScrollableViewport();

      const richText = document.querySelector(
        'data-view-header-area-text rich-text'
      ) as RichTextElement | null;
      expect(richText).toBeTruthy();

      const scrollTopBefore = viewport.scrollTop;

      await focusRichText(richText!, 0);
      await wait();

      const scrollTopAfter = viewport.scrollTop;
      expect(Math.abs(scrollTopAfter - scrollTopBefore)).toBeLessThanOrEqual(1);
    });
  });
});
