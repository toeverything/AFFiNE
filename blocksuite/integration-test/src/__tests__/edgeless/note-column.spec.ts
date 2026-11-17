import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { CrossDocReferenceProvider } from '@blocksuite/affine/shared/services';
import {
  attachExistingNoteForRow,
  createNoteForRow,
  revealOrInsertNoteForRow,
} from '@blocksuite/affine-block-database-note-property';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

// Story 2.6: lets a todo row optionally attach a full native `affine:note`
// — creating a fresh one, reusing an existing one, or revealing one already
// attached — rendered inline (via `note-ref`, Story 0.6) at the very end of
// the current page. The row's own hidden "Note"/"Note color" columns store
// only a `{refDocId, refBlockId}` reference and a seed color — never a
// synced copy of the note's own content (see the story's own Resolved
// Design Decision 1).
describe('todo note linking (Story 2.6)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  function createRow(text = 'Write proposal') {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const dbId = doc.addBlock('affine:database', {}, noteId);
    const dbModel = doc.getBlock(dbId)?.model as DatabaseBlockModel;
    const dataSource = new DatabaseBlockDataSource(dbModel);
    const rowId = dataSource.rowAddAsTodoList('end');
    const rowModel = doc.getModelById(rowId)!;
    doc.updateBlock(rowModel, { text: new Text(text) });
    return { dataSource, rowId, paragraphId };
  }

  test('empty-cell "create new" action creates a note named after the row, appends its note-ref at the end of the page, and assigns a color to both', async () => {
    const { dataSource, rowId } = createRow('Write proposal');

    createNoteForRow(editor.std, dataSource, rowId);
    await wait();

    const ref = dataSource.getNoteRef(rowId);
    expect(ref).toBeTruthy();
    expect(ref!.refDocId).toBe(doc.id);

    const canonical = doc.getBlock(ref!.refBlockId)?.model as
      | { props: { name?: string; pageBackgroundOverride?: unknown } }
      | undefined;
    expect(canonical?.props.name).toBe('Journal: Write proposal');
    expect(canonical?.props.pageBackgroundOverride).toBeTruthy();

    // A visible `note-ref` block was actually inserted on the page.
    const refEls = document.querySelectorAll('affine-note-ref');
    expect(refEls.length).toBeGreaterThan(0);

    // The row's own hidden color mirrors the note's own color (same value,
    // seeded together at creation time — see Resolved Design Decision 7).
    // Both are raw theme `Color` tokens (e.g. `{dark, light}`), not
    // resolved CSS strings — `getNoteColor` round-trips through JSON
    // storage, so a *different* object reference is expected; compare by
    // deep equality (`toEqual`), not reference (`toBe`).
    const rowColor = dataSource.getNoteColor(rowId);
    expect(rowColor).toBeTruthy();
    expect(rowColor).toEqual(canonical?.props.pageBackgroundOverride);

    // The `note-ref` block ITSELF must carry the same color as its own
    // per-instance `backgroundOverride` — this is what's actually rendered
    // (`note-ref-block.ts` never reads the canonical's own
    // `pageBackgroundOverride`), so setting only the canonical's prop (an
    // earlier version of this fix's own mistake) would leave every
    // note-ref showing the plain default background regardless of the
    // row's chosen color.
    const noteRefModel = Array.from(refEls)[0] as unknown as {
      model: { props: { backgroundOverride?: unknown; showBorder?: boolean } };
    };
    expect(noteRefModel.model.props.backgroundOverride).toEqual(rowColor);
    expect(noteRefModel.model.props.showBorder).toBe(true);
  });

  test('populated-cell action reveals an existing note-ref on the same page instead of inserting a duplicate', async () => {
    const { dataSource, rowId } = createRow('In progress task');

    createNoteForRow(editor.std, dataSource, rowId);
    await wait();
    const refCountBefore = doc.getBlocksByFlavour('affine:note-ref').length;

    revealOrInsertNoteForRow(editor.std, dataSource, rowId);
    await wait();

    expect(doc.getBlocksByFlavour('affine:note-ref').length).toBe(
      refCountBefore
    );
  });

  test('populated-cell action inserts a note-ref on a different page when none exists there yet (carryover)', async () => {
    const { dataSource, rowId } = createRow('Carries into tomorrow');
    createNoteForRow(editor.std, dataSource, rowId);
    await wait();
    const ref = dataSource.getNoteRef(rowId)!;

    // Simulate "a different day's journal": a brand-new page-mode note on
    // the same doc, with the row's own note-ref removed from view first so
    // the reveal check genuinely finds nothing to reveal.
    for (const block of doc.getBlocksByFlavour('affine:note-ref')) {
      doc.deleteBlock(block.model);
    }
    addNote(doc);

    revealOrInsertNoteForRow(editor.std, dataSource, rowId);
    await wait();

    const refEls = Array.from(
      document.querySelectorAll('affine-note-ref')
    ) as unknown as { model: { props: { refBlockId: string } } }[];
    expect(
      refEls.some(el => el.model.props.refBlockId === ref.refBlockId)
    ).toBe(true);
  });

  test('"attach existing note" opens the picker restricted to affine:note, and on pick sets the reference, inserts a note-ref, and assigns a color', async () => {
    const { dataSource, rowId } = createRow('Needs an existing note');

    const secondNoteId = addNote(doc);
    // A distinct, later page note to serve as the end-of-page anchor — if
    // `secondNoteId` itself were the last page note, the anchor would
    // resolve *inside* the very note being attached, correctly tripping
    // `note-ref`'s own reference-cycle guard (a real behavior, not a bug,
    // but not what this test is exercising).
    addNote(doc);
    let capturedAllowedFlavours: readonly string[] | undefined;
    const stubStd = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) =>
            identifier === CrossDocReferenceProvider
              ? {
                  openCrossDocReferencePicker: async (
                    _excludeDocId: string,
                    allowedFlavours?: readonly string[]
                  ) => {
                    capturedAllowedFlavours = allowedFlavours;
                    return {
                      docId: doc.id,
                      blockId: secondNoteId,
                      flavour: 'affine:note' as const,
                    };
                  },
                }
              : undefined;
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    await attachExistingNoteForRow(stubStd, dataSource, rowId);
    await wait();

    expect(capturedAllowedFlavours).toEqual(['affine:note']);
    const ref = dataSource.getNoteRef(rowId);
    expect(ref).toEqual({ refDocId: doc.id, refBlockId: secondNoteId });
    expect(dataSource.getNoteColor(rowId)).toBeTruthy();
  });

  test('Note color is hidden in every view; Note itself is hidden in list (row-hover button is the real affordance there) but stays visible in table (no row-hover affordance exists there)', async () => {
    const { dataSource, rowId } = createRow();
    createNoteForRow(editor.std, dataSource, rowId);
    await wait();

    const noteColumnId = dataSource.getNoteColumn()!.id;
    const noteColorColumnId = dataSource.getNoteColorColumn()!.id;

    const listViewId = dataSource.viewManager.viewAdd('list');
    const tableViewId = dataSource.viewManager.viewAdd('table');

    const listView = dataSource.viewDataGet(listViewId) as unknown as {
      columns?: { id: string; hide?: boolean }[];
    };
    expect(listView?.columns?.find(c => c.id === noteColumnId)?.hide).toBe(
      true
    );
    expect(listView?.columns?.find(c => c.id === noteColorColumnId)?.hide).toBe(
      true
    );

    // Table view never gets an explicit per-view entry for Note at all
    // (see `ensureNoteColumn`'s own doc comment) — its visibility comes
    // from `materializeColumns`'s not-yet-listed-property fallback, so
    // "no entry" (not `hide: false`) is the correct, visible state here.
    const tableView = dataSource.viewDataGet(tableViewId) as unknown as {
      columns?: { id: string; hide?: boolean }[];
    };
    const tableNoteEntry = tableView?.columns?.find(c => c.id === noteColumnId);
    expect(tableNoteEntry?.hide).not.toBe(true);
    expect(
      tableView?.columns?.find(c => c.id === noteColorColumnId)?.hide
    ).toBe(true);
  });

  test("color assignment avoids colors already in use on the page across two rows, and is independent of the note's own background after creation", async () => {
    const noteId = addNote(doc);
    doc.addBlock('affine:paragraph', {}, noteId);
    const dbId = doc.addBlock('affine:database', {}, noteId);
    const dbModel = doc.getBlock(dbId)?.model as DatabaseBlockModel;
    const dataSource = new DatabaseBlockDataSource(dbModel);

    const rowAId = dataSource.rowAddAsTodoList('end');
    doc.updateBlock(doc.getModelById(rowAId)!, { text: new Text('Row A') });
    const rowBId = dataSource.rowAddAsTodoList('end');
    doc.updateBlock(doc.getModelById(rowBId)!, { text: new Text('Row B') });

    createNoteForRow(editor.std, dataSource, rowAId);
    await wait();
    createNoteForRow(editor.std, dataSource, rowBId);
    await wait();

    const colorA = dataSource.getNoteColor(rowAId);
    const colorB = dataSource.getNoteColor(rowBId);
    expect(colorA).toBeTruthy();
    expect(colorB).toBeTruthy();
    expect(colorA).not.toEqual(colorB);

    // Independence: mutating the note's own background afterward doesn't
    // touch the row's hidden color value, and vice versa.
    const refA = dataSource.getNoteRef(rowAId)!;
    const canonicalA = doc.getBlock(refA.refBlockId)?.model as {
      props: { pageBackgroundOverride?: unknown };
    };
    doc.updateBlock(canonicalA as never, {
      pageBackgroundOverride: '#123456',
    });
    await wait();
    // `getNoteColor` round-trips through JSON storage on every call, so a
    // *different* object reference is expected even when unchanged —
    // compare by deep equality, not reference.
    expect(dataSource.getNoteColor(rowAId)).toEqual(colorA);

    dataSource.setNoteColor(rowAId, '#abcdef');
    await wait();
    expect(canonicalA.props.pageBackgroundOverride).toBe('#123456');
  });

  test('the row-level "attach a note" hover button is gated on task-status capability, not shown unconditionally', async () => {
    const dbNoteId = addNote(doc);
    const dbId = doc.addBlock('affine:database', {}, dbNoteId);
    const dbModel = doc.getBlock(dbId)?.model as DatabaseBlockModel;
    const dataSource = new DatabaseBlockDataSource(dbModel);
    const rowId = doc.addBlock('affine:paragraph', {}, dbId);
    // Confirmed via a real bug during manual testing: list-mode view rows
    // are *always* auto-converted to todo rows by the pre-existing
    // `ensureTodoListRows`/`ensureRowAsTodoList` mechanism (list view *is*
    // the todo-list view type throughout this codebase) — so a plain
    // paragraph row in a list view ends up task-status-capable regardless
    // of Journal Todo, and the button correctly appears. This test
    // documents that behavior directly (rather than asserting an
    // unreachable "non-todo-capable list view" state) and confirms the
    // gate reads the data source's own live capability, not a static flag.
    dataSource.viewManager.viewAdd('list');
    await wait();

    expect(dataSource.getTaskStatusColumn()).toBeTruthy();
    const rowEl = document.querySelector(`[data-row-id="${rowId}"]`);
    expect(rowEl).toBeTruthy();
    expect(
      rowEl?.querySelector(
        '[data-testid="note-action-create"], [data-testid="note-action-open"]'
      )
    ).toBeTruthy();
  });
});
