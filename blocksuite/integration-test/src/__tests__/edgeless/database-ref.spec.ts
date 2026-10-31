import type { DatabaseRefBlockComponent } from '@blocksuite/affine/blocks/database-ref';
import {
  databaseRefSlashMenuConfig,
  insertDatabaseRefBlockCommand,
  moveIntoHiddenNote,
} from '@blocksuite/affine/blocks/database-ref';
import type {
  DatabaseRefBlockModel,
  NoteBlockModel,
} from '@blocksuite/affine/model';
import { NoteDisplayMode } from '@blocksuite/affine/model';
import { CrossDocReferenceProvider } from '@blocksuite/affine/shared/services';
import { Store, Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

// Story 0.2 (redesigned): giving `affine:database` the same "appears more
// than once on a page, deleting one instance never breaks the others"
// property that Frame already has via `affine:surface-ref`. Frame achieves
// this because its real content lives on the shared `affine:surface`,
// decoupled from any note position — every appearance in page flow,
// including the first, is already a reference. A database has no such
// canvas home (it's flow content, `parent: ['affine:note']` only), so this
// takes a "promotion on second reference" approach instead: the *first*
// table a user creates (via the ordinary, untouched `/database` command)
// stays completely normal until/unless a second reference to it is created,
// at which point it's relocated into a dedicated hidden
// (`displayMode: EdgelessOnly`) note and both the old and new visible spots
// become equal `affine:database-ref` blocks — see commands.ts's
// `ensurePromoted` for the mechanism.
describe('database (Table) appearing more than once on a page', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  function createOrdinaryDatabase() {
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );
    return { noteId, databaseId };
  }

  test('a lone database is untouched — no promotion happens until referenced twice', async () => {
    const { noteId, databaseId } = createOrdinaryDatabase();
    await wait();

    const parent = doc.getParent(databaseId);
    expect(parent?.id).toBe(noteId);
    expect((parent as NoteBlockModel).props.displayMode).toBe(
      NoteDisplayMode.DocAndEdgeless
    );
  });

  test('inserting a second reference promotes the original into a hidden note, both spots become equal references', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();

    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;

    const [_, result] = editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    expect(result.insertedDatabaseRefBlockId).toBeTruthy();
    await wait();

    // The canonical database is now inside a hidden, EdgelessOnly note.
    const canonicalParent = doc.getParent(databaseId);
    expect(canonicalParent?.flavour).toBe('affine:note');
    expect((canonicalParent as NoteBlockModel).props.displayMode).toBe(
      NoteDisplayMode.EdgelessOnly
    );

    // Both the original spot and the new spot are now database-ref blocks.
    const refs = doc.getBlocksByFlavour('affine:database-ref');
    expect(refs.length).toBe(2);
    expect(
      refs.every(
        block =>
          (block.model as DatabaseRefBlockModel).props.refBlockId === databaseId
      )
    ).toBe(true);
  });

  test('the hidden host note inside a database-ref preview never shows the page-mode border/background', async () => {
    // Regression: `affine-note` (the page-mode note component) defaults to
    // showing a border for any non-primary note — but `database-ref`'s
    // nested `'preview-page'` scope renders that same `affine-note`
    // component for the promoted database's hidden `EdgelessOnly` host
    // note (its ancestor-chain), which is never genuinely "in the page".
    // Without excluding `EdgelessOnly` notes from that default, the
    // border/padding bled straight into every referenced table.
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;

    const [_, result] = editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const refEl = document.querySelector(
      `affine-database-ref[data-block-id="${result.insertedDatabaseRefBlockId}"]`
    ) as DatabaseRefBlockComponent;
    const hiddenNoteContainer = refEl.querySelector(
      '.affine-note-block-container'
    ) as HTMLElement | null;
    expect(hiddenNoteContainer?.dataset.pageBorder).toBe('false');
  });

  test('both reference instances render the same live data', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;

    editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const refBlocks = doc.getBlocksByFlavour('affine:database-ref');
    const refEls = refBlocks.map(
      block =>
        document.querySelector(
          `affine-database-ref[data-block-id="${block.id}"]`
        ) as DatabaseRefBlockComponent
    );

    expect(refEls.every(el => !!el?.querySelector('affine-database'))).toBe(
      true
    );

    // Presence in the DOM alone isn't enough: the nested preview is a real
    // edgeless canvas renderer that culls anything outside its own
    // viewport bounds (`getModelsInViewport` in
    // `edgeless-root-preview-block.ts`), and the hidden host note this
    // reference points at is deliberately parked at an out-of-the-way
    // position. A node can exist in the DOM while still being invisible —
    // this bit a real dev-server test even though the DOM-presence check
    // above passed the whole time. Assert actual rendered size instead.
    for (const el of refEls) {
      const databaseEl = el.querySelector('affine-database') as HTMLElement;
      const rect = databaseEl.getBoundingClientRect();
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);

      // The check above alone let a real bug through once already: the
      // *inner* `affine-database` element can report a non-zero rect while
      // the *outer* `affine-database-ref` wrapper — which is what the real
      // page's layout actually reserves space for — collapses to
      // `height: 0px` (the nested edgeless preview styles itself
      // `height: 100%` with no definite ancestor height to resolve against
      // in normal document flow). Assert the wrapper's own computed height
      // directly, since that's what a real dev-server console check caught
      // and this test's earlier version didn't.
      const outerHeight = parseFloat(getComputedStyle(el).height);
      expect(outerHeight).toBeGreaterThan(0);
    }
  });

  test('deleting one reference leaves the other (and the underlying data) intact', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    doc.addBlock('affine:paragraph', {}, databaseId);
    doc.addBlock('affine:paragraph', {}, databaseId);
    await wait();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;

    editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const [firstRef, secondRef] = doc.getBlocksByFlavour('affine:database-ref');
    expect(firstRef).toBeTruthy();
    expect(secondRef).toBeTruthy();
    const rowCountBefore = doc.getModelById(databaseId)!.children.length;
    expect(rowCountBefore).toBe(2);

    doc.deleteBlock(firstRef!.model);
    await wait();

    // The other reference still resolves and renders — the canonical
    // database was never touched by deleting one view of it.
    const survivingEl = document.querySelector(
      `affine-database-ref[data-block-id="${secondRef!.id}"]`
    ) as DatabaseRefBlockComponent;
    expect(survivingEl?.querySelector('affine-database')).toBeTruthy();
    expect(
      survivingEl?.querySelector('.affine-database-ref-error')
    ).toBeFalsy();

    // The canonical database block, and its rows, are still there, untouched.
    expect(doc.getBlock(databaseId)).toBeTruthy();
    expect(doc.getModelById(databaseId)!.children.length).toBe(rowCountBefore);
  });

  test('a row added through one reference view is visible through the other', async () => {
    const { databaseId } = createOrdinaryDatabase();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;

    editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const databaseModel = doc.getModelById(databaseId)!;
    const rowCountBefore = databaseModel.children.length;

    doc.addBlock('affine:paragraph', {}, databaseId);
    await wait();

    expect(databaseModel.children.length).toBe(rowCountBefore + 1);
  });

  test('the database\'s own "Delete Database" action only removes the reference it was invoked through', async () => {
    // Regression: the real, fully-interactive `affine-database` component is
    // rendered inside the nested preview (unlike `surface-ref`'s read-only
    // frame snapshot), so its own more-menu "Delete Database" action —
    // `this.model.children.forEach(b => this.store.deleteBlock(b)); this.store.deleteBlock(this.model)`
    // in `database-block.ts` — is reachable from within a reference view.
    // Called naively it deletes every row *and* the canonical model
    // directly, destroying the data behind every reference at once — an
    // empty test table let an earlier version of this fix through, since
    // it only redirected the final self-delete and never noticed the row
    // loop ahead of it was untouched. `database-ref-block.ts` now buffers
    // child deletions until a microtask flush, discarding them if a
    // same-tick self-delete reveals "this was a whole-table delete", so
    // the table's own redirect (below) decides their fate instead. Note
    // the two references to the *same* table end up sharing one underlying
    // preview store (`getStore` caches by query, and the query only
    // depends on the canonical block, not which reference asked for it),
    // so the redirect can't rely on store identity; it tracks "which
    // reference was last interacted with" via a plain pointerdown listener,
    // exactly like a real click on that reference's own more-menu would
    // produce.
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    doc.addBlock('affine:paragraph', {}, databaseId);
    doc.addBlock('affine:paragraph', {}, databaseId);
    await wait();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;

    editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const [firstRef, secondRef] = doc.getBlocksByFlavour('affine:database-ref');
    const rowCountBefore = doc.getModelById(databaseId)!.children.length;
    expect(rowCountBefore).toBe(2);

    const firstRefEl = document.querySelector(
      `affine-database-ref[data-block-id="${firstRef!.id}"]`
    ) as DatabaseRefBlockComponent;
    firstRefEl.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, composed: true })
    );
    const databaseEl = firstRefEl.querySelector(
      'affine-database'
    ) as HTMLElement & {
      store: { deleteBlock: (m: unknown) => void };
      model: { children: unknown[] };
    };
    expect(databaseEl).toBeTruthy();

    // Exactly what database-block.ts's "Delete Database" more-menu action does.
    databaseEl.model.children.slice().forEach(block => {
      databaseEl.store.deleteBlock(block);
    });
    databaseEl.store.deleteBlock(databaseEl.model);
    await wait();

    // Only the reference this action was invoked through is gone.
    expect(doc.getBlock(firstRef!.id)).toBeFalsy();

    // The canonical database, ALL its rows, and the other reference survive.
    expect(doc.getBlock(databaseId)).toBeTruthy();
    expect(doc.getModelById(databaseId)!.children.length).toBe(rowCountBefore);
    const survivingEl = document.querySelector(
      `affine-database-ref[data-block-id="${secondRef!.id}"]`
    ) as DatabaseRefBlockComponent;
    expect(survivingEl?.querySelector('affine-database')).toBeTruthy();
    expect(
      survivingEl?.querySelector('.affine-database-ref-error')
    ).toBeFalsy();
  });

  test('a text-range selection sweeping across a reference does not reach its nested rows', async () => {
    // Regression: the nested preview renders real content as ordinary
    // light-DOM `[data-block-id]` elements, so `getSelectedBlockComponentsByRange`
    // (used by cross-block Backspace/Delete) could walk straight through a
    // `database-ref` wrapper into the real canonical rows it contains and
    // delete them directly. `database-ref-block.ts` marks everything inside
    // the wrapper `data-range-query-exclude` (the same technique `surface-ref`
    // already uses for its own nested preview) so only the wrapper itself is
    // ever a candidate.
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;

    const [_, result] = editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const refEl = document.querySelector(
      `affine-database-ref[data-block-id="${result.insertedDatabaseRefBlockId}"]`
    ) as DatabaseRefBlockComponent;

    const range = document.createRange();
    range.selectNodeContents(refEl);

    const selected = editor.std.range.getSelectedBlockComponentsByRange(range, {
      mode: 'flat',
    });

    const selectedIds = selected.map(el => el.blockId);
    expect(selectedIds).toContain(result.insertedDatabaseRefBlockId);
    expect(selectedIds).not.toContain(databaseId);
  });

  test('deleting the last remaining reference deletes the canonical data and hidden host note too', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;

    editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const [firstRef, secondRef] = doc.getBlocksByFlavour('affine:database-ref');
    const hiddenNoteId = doc.getParent(databaseId)!.id;

    doc.deleteBlock(firstRef!.model);
    await wait();
    doc.deleteBlock(secondRef!.model);
    await wait();

    expect(doc.getBlocksByFlavour('affine:database-ref').length).toBe(0);
    expect(doc.getBlock(databaseId)).toBeFalsy();
    expect(doc.getBlock(hiddenNoteId)).toBeFalsy();
  });

  test('a third reference stays stable and deleting one of three leaves the others (and the data) intact', async () => {
    // Regression: a plain `refDoc.getStore()` call (no `id`/`query`) mints a
    // brand-new `Store` every single call (`StoreContainer.getStore` falls
    // back to a fresh random cache key), and `_maybeRefreshPreview` /
    // `_subscribeTargetDoc` used to call it unconditionally on every
    // 300ms-debounced doc update, once per live reference — with three
    // references alive that churn grew unstable (surfaced on a real editor
    // as Yjs/preact-signals "Cycle detected" errors) and, worse, coincided
    // with a report of all three references losing their data on delete.
    // Both call sites now request a stable-id store instead.
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;
    editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const thirdNoteId = addNote(doc);
    const thirdModel = doc.getBlock(thirdNoteId)!.model.children[0]!;
    editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [thirdModel],
    });
    await wait();

    // A handful of unrelated edits, giving every live reference's debounced
    // doc-update handler a chance to fire repeatedly (this is what drove
    // the store churn in the regression).
    for (let i = 0; i < 5; i++) {
      doc.addBlock('affine:paragraph', {}, thirdNoteId);
      await wait(350);
    }

    expect(doc.getBlocksByFlavour('affine:database-ref').length).toBe(3);

    const databaseModel = doc.getModelById(databaseId)!;
    doc.addBlock('affine:paragraph', {}, databaseId);
    await wait();
    const rowCountBeforeDelete = databaseModel.children.length;
    expect(rowCountBeforeDelete).toBeGreaterThan(0);

    const [firstRef, secondRef, thirdRef] = doc.getBlocksByFlavour(
      'affine:database-ref'
    );
    doc.deleteBlock(firstRef!.model);
    await wait();

    expect(doc.getBlocksByFlavour('affine:database-ref').length).toBe(2);
    expect(doc.getBlock(databaseId)).toBeTruthy();
    expect(doc.getModelById(databaseId)!.children.length).toBe(
      rowCountBeforeDelete
    );

    for (const ref of [secondRef, thirdRef]) {
      const el = document.querySelector(
        `affine-database-ref[data-block-id="${ref!.id}"]`
      ) as DatabaseRefBlockComponent;
      expect(el?.querySelector('affine-database')).toBeTruthy();
      expect(el?.querySelector('.affine-database-ref-error')).toBeFalsy();
    }
  });

  test('a reparented reference disposes its now-abandoned nested preview store', async () => {
    // Regression: every `Store` (including a query-filtered nested preview
    // one) builds its own fully independent reactive object graph for every
    // block it can see — `Store.dispose()` exists specifically to tear this
    // down. `_maybeRefreshPreview` used to replace `_previewStore` with a
    // fresh one (whenever the canonical block's ancestor chain changed)
    // without ever disposing the one it replaced — leaving its entire graph
    // of per-block Yjs observers running forever, racing the new one
    // against the same underlying data. Left unbounded, this is exactly the
    // shape of bug that can trip signals' own re-entrancy guard ("Cycle
    // detected") under rapid successive writes — worst on a reload, when a
    // burst of incoming Yjs updates is most likely to shift the ancestor
    // chain more than once in quick succession.
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;
    editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const disposeSpy = vi.spyOn(Store.prototype, 'dispose');

    // Force the canonical block's ancestor chain to change by moving it to
    // a second hidden note — exactly the kind of structural shift that
    // makes `_maybeRefreshPreview` rebuild `_previewStore`.
    const rootId = doc.root!.id;
    const secondHiddenNoteId = doc.addBlock(
      'affine:note',
      { displayMode: NoteDisplayMode.EdgelessOnly },
      rootId
    );
    const canonicalModel = doc.getModelById(databaseId)!;
    doc.moveBlocks([canonicalModel], doc.getModelById(secondHiddenNoteId)!);
    await wait(500);

    expect(disposeSpy).toHaveBeenCalled();
    disposeSpy.mockRestore();

    // The reference still renders correctly through the rebuilt store.
    const [ref] = doc.getBlocksByFlavour('affine:database-ref');
    const refEl = document.querySelector(
      `affine-database-ref[data-block-id="${ref!.id}"]`
    ) as DatabaseRefBlockComponent;
    expect(refEl?.querySelector('affine-database')).toBeTruthy();
    expect(refEl?.querySelector('.affine-database-ref-error')).toBeFalsy();
  });

  test('a select-column update on a Kanban card does not cause a runaway "views" write loop', async () => {
    // Regression: `ViewManagerBase.viewGet` (data-view/src/core/view-manager/view-manager.ts)
    // used to construct a brand-new `SingleView` on every call, uncached.
    // Since `currentView$` is a `computed()` whose body calls `viewGet`,
    // every signal read anywhere in that call stack — including inside a
    // freshly-built `SingleView`'s own constructor — gets tracked as one of
    // `currentView$`'s dependencies. The table/kanban view constructors
    // synchronously read `properties$`/`views` and can write back to them
    // once (`materializeColumns`). With a fresh instance built on every
    // recompute, that write re-triggers `currentView$`, rebuilding another
    // fresh instance, which writes again. Harmless with one live instance
    // (settles after one or two iterations) — but this same table
    // rendered through two independent `ViewManagerBase`s at once (via two
    // references) turns it into an unbounded ping-pong: each one's
    // uncached rebuild-and-rewrite keeps invalidating the other's
    // `views$`, and neither ever stops. On a real editor this tripped
    // signals' own re-entrancy guard ("Cycle detected") after 100+
    // synchronous re-entrant writes. `viewGet` now caches the constructed
    // view per id, so its constructor (and any write-back inside it) only
    // ever runs once per id per `ViewManagerBase`.
    const { addProperty, updateCell, DatabaseBlockDataSource } =
      await import('@blocksuite/affine/blocks/database');
    const { propertyModelPresets } =
      await import('@blocksuite/data-view/property-pure-presets');
    const { viewPresets } = await import('@blocksuite/data-view/view-presets');

    const { databaseId } = createOrdinaryDatabase();
    const rowId = doc.addBlock('affine:paragraph', {}, databaseId);
    await wait();

    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;
    editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const dbModel = doc.getModelById(databaseId)! as unknown as {
      props: { columns: unknown[] };
      yBlock: {
        observe: (cb: (event: { keysChanged: Set<string> }) => void) => void;
      };
    };
    const selection = [
      { id: '1', value: 'Done', color: 'var(--affine-tag-white)' },
      { id: '2', value: 'TODO', color: 'var(--affine-tag-pink)' },
    ];
    const colId = addProperty(
      dbModel as never,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    doc.updateBlock(dbModel as never, {
      columns: [...dbModel.props.columns, colId],
    });
    await wait();

    const datasource = new DatabaseBlockDataSource(dbModel as never);
    datasource.viewManager.viewAdd(viewPresets.kanbanViewMeta.type);
    await wait();

    let viewsWriteCount = 0;
    dbModel.yBlock.observe(event => {
      if (event.keysChanged.has('prop:views')) viewsWriteCount++;
    });

    updateCell(dbModel as never, rowId, {
      columnId: colId,
      value: [selection[0]],
    });
    await wait(500);

    // A single cell update settling normally takes a handful of writes at
    // most; a runaway loop produces hundreds within this same window.
    expect(viewsWriteCount).toBeLessThan(20);
  });

  test('switching to Kanban view after referencing does not permanently hide the database', async () => {
    // Regression (reported live, 2026-07-27): `database-ref-block.ts`'s
    // `_syncCurrentView` calls `viewManager.viewGet(id)` on every `updated()`
    // and every nested-preview DOM mutation — far more often than a normal,
    // unreferenced database ever calls it. With `viewGet` uncached (see the
    // test above — this is the same root cause, just triggered by a
    // higher-frequency caller), every one of those calls constructed a
    // brand-new `KanbanSingleView`, whose constructor builds a fresh
    // `GroupTrait` with un-disposed `effect()` subscriptions and can write
    // back to `columns` via `materializeColumns()`. Under `database-ref`'s
    // polling frequency this accumulated enough leaked subscriptions and
    // racy writes to eventually throw inside a render pass, which — since
    // the nested `affine-database` is rendered inside a
    // `guard()` block — left the reference (and the canonical it points at)
    // silently empty, with no error surfaced to the user.
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;

    const [_, result] = editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const { viewPresets } = await import('@blocksuite/data-view/view-presets');

    // Switch through the *live* nested `affine-database`'s own data source
    // (the one `_syncCurrentView` itself reads/writes) rather than a
    // throwaway standalone instance — a fresh, unconnected
    // `DatabaseBlockDataSource` never actually drives what's on screen, so
    // switching its view wouldn't touch the real rendering path this bug
    // lives in.
    const refElBeforeSwitch = document.querySelector(
      `affine-database-ref[data-block-id="${result.insertedDatabaseRefBlockId}"]`
    ) as DatabaseRefBlockComponent;
    const liveDatabaseEl = refElBeforeSwitch.querySelector(
      'affine-database'
    ) as unknown as HTMLElement & {
      dataSource: {
        value: {
          viewManager: {
            viewAdd: (t: string) => string;
            setCurrentView: (id: string) => void;
          };
        };
      };
    };
    const kanbanViewId = liveDatabaseEl.dataSource.value.viewManager.viewAdd(
      viewPresets.kanbanViewMeta.type
    );
    liveDatabaseEl.dataSource.value.viewManager.setCurrentView(kanbanViewId);
    await wait();

    // Force many `updated()`/mutation cycles on the live reference — the
    // exact condition that made the uncached `viewGet` accumulate enough
    // leaked state to break.
    for (let i = 0; i < 15; i++) {
      doc.addBlock('affine:paragraph', {}, databaseId);
      await wait(50);
    }
    await wait(300);

    expect(doc.getBlock(databaseId)).toBeTruthy();
    const refEl = document.querySelector(
      `affine-database-ref[data-block-id="${result.insertedDatabaseRefBlockId}"]`
    ) as DatabaseRefBlockComponent;
    const databaseEl = refEl?.querySelector('affine-database') as HTMLElement;
    expect(databaseEl).toBeTruthy();
    const rect = databaseEl.getBoundingClientRect();
    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
  });

  test('a pointerdown inside a reference keeps its own nested dispatcher active', async () => {
    // Regression: `UIEventDispatcher` (the source of every synthetic
    // BlockSuite UI event, including Kanban drag-and-drop's `dragStart` —
    // see `KanbanDragController.hostConnected`, gated on
    // `this.logic.view.readonly$`/dispatched only when `dispatcher.active`)
    // tracks exactly one app-wide "active" dispatcher in a *static* field.
    // It activates on pointerdown/click/etc. bubbling up to its own host —
    // but our nested `BlockStdScope`'s host is a light-DOM *descendant* of
    // the outer page's own host (this component is `ShadowlessElement`,
    // like every block), so the same pointerdown that correctly activates
    // the nested dispatcher first keeps bubbling and reaches the OUTER
    // host's identical listener too, immediately reactivating the outer
    // one and deactivating the nested one again — every time. This is why
    // dragging a Kanban tile silently did nothing while right-click "Move"
    // (a plain native `contextmenu` menu, unrelated to this system) still
    // worked. `database-ref-block.ts` stops these specific events from
    // bubbling past its own wrapper boundary.
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;

    editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const [ref] = doc.getBlocksByFlavour('affine:database-ref');
    const refEl = document.querySelector(
      `affine-database-ref[data-block-id="${ref!.id}"]`
    ) as DatabaseRefBlockComponent;
    const databaseEl = refEl.querySelector('affine-database') as HTMLElement & {
      std: { event: { active: boolean } };
    };
    expect(databaseEl).toBeTruthy();

    databaseEl.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, composed: true })
    );
    await wait();

    expect(databaseEl.std.event.active).toBe(true);
    expect(editor.std.event.active).toBe(false);
  });

  test('routine edits do not rebuild the nested preview scope', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    const secondNoteId = addNote(doc);
    const secondModel = doc.getBlock(secondNoteId)!.model.children[0]!;

    const [_, result] = editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondModel],
    });
    await wait();

    const refEl = document.querySelector(
      `affine-database-ref[data-block-id="${result.insertedDatabaseRefBlockId}"]`
    ) as DatabaseRefBlockComponent;
    const databaseElBefore = refEl.querySelector('affine-database');
    expect(databaseElBefore).toBeTruthy();

    for (let i = 0; i < 10; i++) {
      doc.addBlock('affine:paragraph', {}, databaseId);
    }
    await wait(400);

    const databaseElAfter = refEl.querySelector('affine-database');
    expect(databaseElAfter).toBe(databaseElBefore);
  });
});

// Story 0.3: genuine cross-doc (inter-page) referencing for Database,
// building on 0.2's same-page-only primitive. The creation UI (a cross-doc
// picker) doesn't exist yet (that's a separate task in this same story) —
// these tests construct the cross-doc `affine:database-ref` block directly
// (`refBlockId` + a real foreign `refDocId`), exercising the resolver and
// delete-cascade logic in isolation from the not-yet-built picker UI.
describe('database (Table) referenced across pages (cross-doc)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  // Mirrors `initCollection` in `utils/setup.ts` — a second, genuinely
  // separate doc within the same `TestWorkspace`/`collection`, the same
  // shape a real second page would have.
  function createSecondDoc() {
    const secondDoc = collection
      .createDoc(`doc:second-${Math.random().toString(16).slice(2, 8)}`)
      .getStore();
    secondDoc.load(() => {
      const rootId = secondDoc.addBlock('affine:page', { title: new Text() });
      secondDoc.addBlock('affine:surface', {}, rootId);
    });
    return secondDoc;
  }

  // Promotes `databaseId` into a hidden `EdgelessOnly` note directly,
  // mirroring what `ensurePromoted` (`commands.ts`) does for the same-doc
  // case — done manually here since the cross-doc creation picker doesn't
  // exist yet; this isolates the resolver/delete-cascade behavior under
  // test from that separate, not-yet-built UI.
  function promoteToHiddenNote(targetDoc: Store, databaseId: string) {
    // Reuses the real `moveIntoHiddenNote` (the same logic `ensurePromoted`
    // itself calls) rather than hand-rolling it — but not `ensurePromoted`
    // directly, since that also leaves a same-doc `database-ref` behind at
    // the old spot, which would give these deliberately cross-doc-only
    // scenarios an extra same-doc reference they don't want.
    const hiddenNoteId = moveIntoHiddenNote(
      targetDoc,
      targetDoc.getModelById(databaseId)!
    );
    return hiddenNoteId!;
  }

  test('a database in another doc renders live and shares data across the two pages', async () => {
    const secondDoc = createSecondDoc();
    const secondNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text() },
      secondNoteId
    );
    promoteToHiddenNote(secondDoc, databaseId);

    const noteId = addNote(doc);
    const refId = doc.addBlock(
      'affine:database-ref',
      { refBlockId: databaseId, refDocId: secondDoc.id },
      noteId
    );
    await wait();

    const refEl = document.querySelector(
      `affine-database-ref[data-block-id="${refId}"]`
    ) as DatabaseRefBlockComponent;
    expect(refEl?.querySelector('affine-database')).toBeTruthy();
    expect(refEl?.querySelector('.affine-database-ref-error')).toBeFalsy();

    const rowCountBefore = secondDoc.getModelById(databaseId)!.children.length;
    secondDoc.addBlock('affine:paragraph', {}, databaseId);
    await wait();

    // A row added directly on the source doc is visible through the
    // cross-doc reference's own live rendering — the whole point of this
    // story over the accidental brute-force scan `surface-ref` already had.
    expect(secondDoc.getModelById(databaseId)!.children.length).toBe(
      rowCountBefore + 1
    );
  });

  test('deleting the only cross-doc reference cascades to the canonical data and hidden note in the other doc', async () => {
    const secondDoc = createSecondDoc();
    const secondNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text() },
      secondNoteId
    );
    const hiddenNoteId = promoteToHiddenNote(secondDoc, databaseId);

    const noteId = addNote(doc);
    const refId = doc.addBlock(
      'affine:database-ref',
      { refBlockId: databaseId, refDocId: secondDoc.id },
      noteId
    );
    await wait();

    doc.deleteBlock(doc.getBlock(refId)!.model);
    await wait();

    expect(secondDoc.getBlock(databaseId)).toBeFalsy();
    expect(secondDoc.getBlock(hiddenNoteId)).toBeFalsy();
  });

  test('deleting one of several cross-doc references (scattered across different docs) leaves the canonical and the others intact', async () => {
    const secondDoc = createSecondDoc();
    const secondNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text() },
      secondNoteId
    );
    promoteToHiddenNote(secondDoc, databaseId);

    const thirdDoc = createSecondDoc();
    const thirdNoteId = addNote(thirdDoc);
    const refInThirdId = thirdDoc.addBlock(
      'affine:database-ref',
      { refBlockId: databaseId, refDocId: secondDoc.id },
      thirdNoteId
    );

    const noteId = addNote(doc);
    const refInMainId = doc.addBlock(
      'affine:database-ref',
      { refBlockId: databaseId, refDocId: secondDoc.id },
      noteId
    );
    await wait();

    // Delete the reference living in the *current* doc — the other
    // reference lives in a completely different (third) doc, neither the
    // current one nor the canonical's own. The old (same-doc-only)
    // delete-guard logic only ever checked for siblings within the
    // deleting doc, so it would have missed this one and wrongly cascaded.
    doc.deleteBlock(doc.getBlock(refInMainId)!.model);
    await wait();

    expect(secondDoc.getBlock(databaseId)).toBeTruthy();
    expect(thirdDoc.getBlock(refInThirdId)).toBeTruthy();
  });

  test('insertDatabaseRefBlockCommand creates a cross-doc reference without promoting the source', async () => {
    const secondDoc = createSecondDoc();
    const secondNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text() },
      secondNoteId
    );

    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);

    const [success, result] = editor.std.command.exec(
      insertDatabaseRefBlockCommand,
      {
        refBlockId: databaseId,
        refDocId: secondDoc.id,
        place: 'after',
        selectedModels: [doc.getModelById(paragraphId)!],
      }
    );
    await wait();

    expect(success).toBeTruthy();
    expect(result.insertedDatabaseRefBlockId).toBeTruthy();

    const refModel = doc.getBlock(result.insertedDatabaseRefBlockId!)!
      .model as DatabaseRefBlockModel;
    expect(refModel.props.refBlockId).toBe(databaseId);
    expect(refModel.props.refDocId).toBe(secondDoc.id);

    // Cross-doc: the source database already lives in its own doc, so
    // inserting a reference to it must NOT promote/move it into a hidden
    // note the way the same-doc second-reference case does.
    const sourceParent = secondDoc.getParent(
      secondDoc.getModelById(databaseId)!
    );
    expect(sourceParent?.id).toBe(secondNoteId);
    expect((sourceParent as NoteBlockModel).props.displayMode).not.toBe(
      NoteDisplayMode.EdgelessOnly
    );
  });

  // AC7: a database that is BOTH same-page-promoted (Story 0.2, 2+ local
  // references) AND cross-doc referenced (this story) is the first case in
  // this codebase rendered through 3+ simultaneous `Store` views of one
  // block at once. The 0.2 multi-instance fixes (sibling-`SyncController`
  // registry, `ReactiveYMap`'s cache-hit listener gap) were only proven at
  // exactly 2 — this re-verifies they hold at 3, and across a doc boundary,
  // not just within one doc.
  test('a database that is both same-page-promoted and cross-doc referenced stays in sync across all 3 simultaneous views', async () => {
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );

    // Local reference #1: triggers promotion into a hidden note.
    const firstRefNoteId = addNote(doc);
    const firstAnchor = doc.getBlock(firstRefNoteId)!.model.children[0]!;
    const [, result1] = editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [firstAnchor],
    });
    await wait();

    // Local reference #2: same doc, second local view.
    const secondRefNoteId = addNote(doc);
    const secondAnchor = doc.getBlock(secondRefNoteId)!.model.children[0]!;
    const [, result2] = editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondAnchor],
    });
    await wait();

    // Cross-doc reference #3: a third doc referencing the same canonical.
    const thirdDoc = createSecondDoc();
    const thirdNoteId = addNote(thirdDoc);
    const refInThirdId = thirdDoc.addBlock(
      'affine:database-ref',
      { refBlockId: databaseId, refDocId: doc.id },
      thirdNoteId
    );
    await wait();

    expect(result1.insertedDatabaseRefBlockId).toBeTruthy();
    expect(result2.insertedDatabaseRefBlockId).toBeTruthy();

    const refEls = [
      document.querySelector(
        `affine-database-ref[data-block-id="${result1.insertedDatabaseRefBlockId}"]`
      ),
      document.querySelector(
        `affine-database-ref[data-block-id="${result2.insertedDatabaseRefBlockId}"]`
      ),
    ] as DatabaseRefBlockComponent[];
    expect(refEls[0]?.querySelector('affine-database')).toBeTruthy();
    expect(refEls[1]?.querySelector('affine-database')).toBeTruthy();

    const rowCountBefore = doc.getModelById(databaseId)!.children.length;

    // Add a row from the third (cross-doc) view's own Store instance —
    // exercising the sibling-registry fan-out across a doc boundary, not
    // just within one doc's own set of `SyncController`s.
    thirdDoc.workspace
      .getDoc(doc.id)!
      .getStore()
      .addBlock('affine:paragraph', {}, databaseId);
    await wait();

    expect(doc.getModelById(databaseId)!.children.length).toBe(
      rowCountBefore + 1
    );
    // Both local references must observe the same update — proving all 3
    // simultaneous views (2 local + 1 cross-doc) stay in sync together,
    // not just pairwise.
    expect(refEls[0]!.querySelector('affine-database')).toBeTruthy();
    expect(refEls[1]!.querySelector('affine-database')).toBeTruthy();
    expect(thirdDoc.getBlock(refInThirdId)).toBeTruthy();
  });

  // AC6: `docId` + `blockId` addressing (never a stored path) means a
  // cross-doc reference must survive both the source block moving within
  // its doc and the source doc itself being renamed.
  test('a cross-doc reference survives the source block moving and the source doc being renamed', async () => {
    const secondDoc = createSecondDoc();
    const firstNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text() },
      firstNoteId
    );

    const noteId = addNote(doc);
    const refId = doc.addBlock(
      'affine:database-ref',
      { refBlockId: databaseId, refDocId: secondDoc.id },
      noteId
    );
    await wait();

    // Move the source database to a different note within the same doc.
    const secondNoteId = addNote(secondDoc);
    secondDoc.moveBlocks(
      [secondDoc.getModelById(databaseId)!],
      secondDoc.getModelById(secondNoteId)!
    );

    // Structural ancestor-chain changes trigger an async preview-store
    // rebuild (`_maybeRefreshPreview`) — give it the same margin the
    // same-doc reparenting regression test above uses.
    await wait(500);

    // Rename the source doc itself.
    const pageBlock = secondDoc.getBlock(secondDoc.root!.id)!.model as {
      props: { title: Text };
    } & typeof secondDoc.root;
    secondDoc.transact(() => {
      pageBlock.props.title.clear();
      pageBlock.props.title.insert('Renamed Doc', 0);
    });
    await wait();

    const refEl = document.querySelector(
      `affine-database-ref[data-block-id="${refId}"]`
    ) as DatabaseRefBlockComponent;
    expect(refEl?.querySelector('affine-database')).toBeTruthy();
    expect(refEl?.querySelector('.affine-database-ref-error')).toBeFalsy();
    expect(secondDoc.getParent(databaseId)?.id).toBe(secondNoteId);
  });

  // Exercises the real user-facing entry point — the unified "Reference"
  // slash-menu item's own `action` — rather than bypassing it by setting
  // `refDocId`/`refBlockId` directly like every test above does. Stubs
  // `CrossDocReferenceProvider` (the picker's own bridge) so this can run
  // without the full React QuickSearch UI.
  test('the unified "Reference" slash-menu action inserts a database-ref via a stubbed picker', async () => {
    const secondDoc = createSecondDoc();
    const secondNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text() },
      secondNoteId
    );

    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;

    // Proxies `getOptional` to return a stub `CrossDocReferenceProvider`
    // without touching the real `editor.std` — the slash-menu item's
    // `action` closure captures whichever `std` is passed to `items(...)`.
    const stubStd = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) =>
            identifier === CrossDocReferenceProvider
              ? {
                  openCrossDocReferencePicker: async () => ({
                    docId: secondDoc.id,
                    blockId: databaseId,
                    flavour: 'affine:database' as const,
                  }),
                }
              : undefined;
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const items = databaseRefSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stubStd, model }) : items;
    const referenceItem = resolvedItems.find(item => item.name === 'Reference');
    expect(referenceItem).toBeTruthy();
    expect(referenceItem && 'action' in referenceItem).toBeTruthy();

    await (
      referenceItem as unknown as { action: () => Promise<void> }
    ).action();
    await wait();

    const refs = doc.getBlocksByFlavour('affine:database-ref');
    expect(refs.length).toBe(1);
    const refModel = refs[0]!.model as DatabaseRefBlockModel;
    expect(refModel.props.refBlockId).toBe(databaseId);
    expect(refModel.props.refDocId).toBe(secondDoc.id);
  });

  test('the unified "Reference" slash-menu action inserts a surface-ref via a stubbed picker', async () => {
    const secondDoc = createSecondDoc();
    const surfaceId = secondDoc.getBlocksByFlavour('affine:surface')[0]!.id;
    const frameId = secondDoc.addBlock(
      'affine:frame',
      { xywh: '[0, 0, 800, 200]', title: new Text('Stubbed Frame') },
      surfaceId
    );

    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;

    const stubStd = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) =>
            identifier === CrossDocReferenceProvider
              ? {
                  openCrossDocReferencePicker: async () => ({
                    docId: secondDoc.id,
                    blockId: frameId,
                    flavour: 'affine:frame' as const,
                  }),
                }
              : undefined;
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const items = databaseRefSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stubStd, model }) : items;
    const referenceItem = resolvedItems.find(item => item.name === 'Reference');

    await (
      referenceItem as unknown as { action: () => Promise<void> }
    ).action();
    await wait();

    const refs = doc.getBlocksByFlavour('affine:surface-ref');
    expect(refs.length).toBe(1);
  });

  // Story 0.5: the same unified "Reference" slash-menu item, extended to a
  // third candidate flavour (Note) — mirrors the two tests above exactly.
  test('the unified "Reference" slash-menu action inserts a note-ref via a stubbed picker', async () => {
    const secondDoc = createSecondDoc();
    const secondNoteId = addNote(secondDoc);
    const secondNoteParagraph =
      secondDoc.getModelById(secondNoteId)!.children[0]!;
    secondDoc.updateBlock(secondNoteParagraph, {
      text: new Text('Stubbed Note'),
    });

    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;

    const stubStd = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) =>
            identifier === CrossDocReferenceProvider
              ? {
                  openCrossDocReferencePicker: async () => ({
                    docId: secondDoc.id,
                    blockId: secondNoteId,
                    flavour: 'affine:note' as const,
                  }),
                }
              : undefined;
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const items = databaseRefSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stubStd, model }) : items;
    const referenceItem = resolvedItems.find(item => item.name === 'Reference');

    await (
      referenceItem as unknown as { action: () => Promise<void> }
    ).action();
    await wait();

    const refs = doc.getBlocksByFlavour('affine:note-ref');
    expect(refs.length).toBe(1);
    const refModel = refs[0]!.model as unknown as {
      props: { refBlockId: string; refDocId: string };
    };
    expect(refModel.props.refBlockId).toBe(secondNoteId);
    expect(refModel.props.refDocId).toBe(secondDoc.id);
  });
});
