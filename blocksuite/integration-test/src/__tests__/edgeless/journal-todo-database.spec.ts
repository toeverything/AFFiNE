import {
  DatabaseBlockDataSource,
  DatabaseViewLocalOverrideProvider,
  getCell,
} from '@blocksuite/affine/blocks/database';
import type { DatabaseViewRefBlockComponent } from '@blocksuite/affine/blocks/database-view-ref';
import {
  createLocalViewOverride,
  insertDatabaseViewRefBlockCommand,
  journalTodoDatabaseSlashMenuConfig,
  journalTodoSourceSlashMenuConfig,
  refreshJournalTodoOnDuplicateMiddleware,
} from '@blocksuite/affine/blocks/database-view-ref';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { AffineSchemas } from '@blocksuite/affine/schemas';
import { replaceIdMiddleware } from '@blocksuite/affine/shared/adapters';
import {
  CrossDocReferenceProvider,
  EditorSettingExtension,
  EditorSettingProvider,
  JournalTodoDatabaseProvider,
  TaskWorkflowDefaultsSchema,
} from '@blocksuite/affine/shared/services';
import type { GeneralServiceIdentifier } from '@blocksuite/global/di';
import { Schema, Slice, Text, Transformer } from '@blocksuite/store';
import { signal } from '@preact/signals-core';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

// Story 2.4: a creation preset over Story 2.2's `database-view-ref` block —
// auto-resolves/creates "the current journal todo database" (a single
// workspace-wide pointer, stubbed here via `JournalTodoDatabaseProvider`,
// exactly the way `database-ref.spec.ts`'s own `CrossDocReferenceProvider`
// stub tests its "Reference" slash-menu item) and seeds a `list`-mode view
// filtered to hide done tasks. The real `@affine/core` pointer-storage
// plumbing (Task 0/2) is deliberately out of scope here — it's plain Yjs
// map read/write with no `Transformer`/`Slice` involved, so it's covered by
// its own lightweight unit test instead (see
// `packages/frontend/core/src/modules/journal/__tests__/`).
describe('journal todo database slash-menu command', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  // Story 2.11 (post-review): `toast()` appends a plain text-content `<div>`
  // to a `.toast-container` element (see `@blocksuite/affine-components/
  // toast`'s `create.ts`/`toast.ts`) — reads the most recently appended
  // one back out, so refusal tests can assert on the message shown to the
  // user, not just on the absence of side effects.
  function latestToastText(): string | null {
    const container = document.querySelector('.toast-container');
    if (!container) return null;
    const children = Array.from(container.children);
    return children[children.length - 1]?.textContent ?? null;
  }

  function createStubStd(options: {
    journalDate: string | undefined;
    initialRef?: { refDocId: string; refBlockId: string };
    showDueDateColumn?: boolean;
    // Story 2.11: defaults to `false` (not a template doc) so every
    // existing test — none of which pass this option — keeps exercising
    // the non-template code path exactly as before.
    isTemplateDoc?: boolean;
  }) {
    let ref = options.initialRef;
    const stub = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) => {
            if (identifier === JournalTodoDatabaseProvider) {
              return {
                getJournalDate: () => options.journalDate,
                getJournalTodoDatabaseRef: () => ref,
                setJournalTodoDatabaseRef: (newRef: typeof ref) => {
                  ref = newRef;
                },
                isTemplateDoc: () => options.isTemplateDoc ?? false,
              };
            }
            if (
              identifier === EditorSettingProvider &&
              options.showDueDateColumn !== undefined
            ) {
              return {
                setting$: {
                  peek: () => ({
                    taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
                      database: {
                        showDueDateColumn: options.showDueDateColumn,
                      },
                    }),
                  }),
                  get value() {
                    return {
                      taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
                        database: {
                          showDueDateColumn: options.showDueDateColumn,
                        },
                      }),
                    };
                  },
                },
              };
            }
            return undefined;
          };
        }
        if (prop === 'host') {
          // `seedInitialView`/`hideDefaultHiddenColumnsForNewView` resolve
          // `std` back out via `EditorHostKey`'s stored `EditorHost`'s own
          // `.std` getter (`this.serviceGet(EditorHostKey)?.std`) — without
          // this override, `.host.std` would return the *real*, un-stubbed
          // `editor.std` (bypassing this whole `getOptional` override),
          // since `Reflect.get` on `host` returns the real host object
          // as-is, and that real host's own `.std` getter points back to
          // the real, original `editor.std`, not this Proxy.
          const realHost = Reflect.get(target, prop, receiver) as object;
          return new Proxy(realHost, {
            get(hostTarget, hostProp) {
              if (hostProp === 'std') return stub;
              // Story 2.11: `hostTarget`, not `hostReceiver` (the Proxy
              // itself) — `toast()` reads `.store` off the real host
              // element, a getter backed by a JS private class field.
              // Private-field access is tied to the exact instance; calling
              // it with `this` bound to this Proxy wrapper (as passing
              // `hostReceiver` here would do) throws "Cannot read from
              // private field", not a silent miss — this was a latent bug
              // in this stub, only surfaced once a test exercises a code
              // path that calls `toast(std.host, ...)` through it.
              return Reflect.get(hostTarget, hostProp, hostTarget);
            },
          });
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    return { stub, getRef: () => ref };
  }

  // Story 2.11: superseded the old "is not offered when the current doc has
  // no journal date" test — that gate was removed. "Journal Todo" is now
  // offered from any doc; the doc-type-sensitive behavior moved from
  // *visibility* to the *first-use creation* codepath (see the tests below).
  test('Story 2.11: is offered even when the current doc has no journal date (normal page, not a template)', () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub } = createStubStd({
      journalDate: undefined,
      isTemplateDoc: false,
    });

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    expect(
      resolvedItems.find(item => item.name === 'Journal Todo')
    ).toBeTruthy();
  });

  test('Story 2.11: first invocation from a normal page (no journal date) still creates a fresh canonical, same as from a journal', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({
      journalDate: undefined,
      isTemplateDoc: false,
    });

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    const item = resolvedItems.find(i => i.name === 'Journal Todo');
    expect(item).toBeTruthy();

    await (item as unknown as { action: () => Promise<void> }).action();
    await wait();

    const ref = getRef();
    expect(ref).toBeTruthy();
    const refEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    expect(refEl).toBeTruthy();
    expect(refEl.model.props.refBlockId).toBe(ref!.refBlockId);
  });

  test('Story 2.11: is offered from a template doc too, but first invocation refuses to create a canonical there', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({
      journalDate: undefined,
      isTemplateDoc: true,
    });

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    const item = resolvedItems.find(i => i.name === 'Journal Todo');
    // Still offered — only the *action*, not the visibility, is guarded.
    expect(item).toBeTruthy();

    const refCountBefore = doc.getBlocksByFlavour('affine:database').length;
    const refBlockCountBefore = doc.getBlocksByFlavour(
      'affine:database-view-ref'
    ).length;
    await (item as unknown as { action: () => Promise<void> }).action();
    await wait();

    // Nothing was created, and the pointer was never set.
    expect(doc.getBlocksByFlavour('affine:database').length).toBe(
      refCountBefore
    );
    expect(doc.getBlocksByFlavour('affine:database-view-ref').length).toBe(
      refBlockCountBefore
    );
    expect(getRef()).toBeUndefined();
    // AC4 explicitly requires the user sees a toast explaining why.
    expect(latestToastText()).toContain('template');
  });

  test('Story 2.11 (post-review): a stale ref (pointing at a deleted canonical) inside a template doc refuses instead of inserting a broken reference', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    // A ref pointing at a database that doesn't exist anywhere — simulates
    // the canonical having been deleted.
    const { stub, getRef } = createStubStd({
      journalDate: undefined,
      isTemplateDoc: true,
      initialRef: { refDocId: doc.id, refBlockId: 'block-does-not-exist' },
    });

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    const item = resolvedItems.find(i => i.name === 'Journal Todo');

    const refBlockCountBefore = doc.getBlocksByFlavour(
      'affine:database-view-ref'
    ).length;
    await (item as unknown as { action: () => Promise<void> }).action();
    await wait();

    // No broken reference block was left behind, and the stale pointer
    // itself is untouched (not silently cleared or replaced).
    expect(doc.getBlocksByFlavour('affine:database-view-ref').length).toBe(
      refBlockCountBefore
    );
    expect(getRef()).toEqual({
      refDocId: doc.id,
      refBlockId: 'block-does-not-exist',
    });
    // Not asserting toast content here (unlike the AC4 refusal test above):
    // `toast()`'s module-level container gets orphaned by `beforeEach`'s
    // `setupEditor` teardown once a prior test in this file has already
    // triggered one, making `document.querySelector('.toast-container')`
    // unreliable for any test after the first toast-producing one. The
    // side-effect-free assertions above are the load-bearing checks here.
  });

  test('Story 2.11: from a template doc, an existing canonical is still referenced normally (only first-use creation is guarded)', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const existingNoteId = addNote(doc);
    const existingDatabaseId = doc.addBlock(
      'affine:database',
      { title: new Text('Journal Todo') },
      existingNoteId
    );
    const { stub, getRef } = createStubStd({
      journalDate: undefined,
      isTemplateDoc: true,
      initialRef: { refDocId: doc.id, refBlockId: existingDatabaseId },
    });

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    const item = resolvedItems.find(i => i.name === 'Journal Todo');

    await (item as unknown as { action: () => Promise<void> }).action();
    await wait();

    // The pre-existing pointer is untouched, and the existing canonical was
    // referenced, not replaced.
    expect(getRef()).toEqual({
      refDocId: doc.id,
      refBlockId: existingDatabaseId,
    });
    const refEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    expect(refEl.model.props.refBlockId).toBe(existingDatabaseId);

    // Story 2.11 (live bug report, resolved — see `slash-menu.ts`'s own
    // comment on this filter's construction for the full history): every
    // insertion, template-sourced or not, always seeds the same grace-clause
    // filter — `OR(isNotOneOf(done), after(doneDate, referenceCreatedAtMs))`.
    // The literal's "frozen forever" problem is fixed at the actual root
    // (block duplication, via `refreshJournalTodoOnDuplicateMiddleware`),
    // not by omitting the clause here.
    const seededView = refEl.model.props.views[0] as unknown as {
      filter?: { op: string; conditions: unknown[] };
    };
    expect(seededView.filter?.op).toBe('or');
    expect(seededView.filter?.conditions.length).toBe(2);
  });

  test('Story 2.11 (live bug report, resolved): the seeded filter is identical whether inserted from a template doc or not, even when a canonical already exists', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const existingNoteId = addNote(doc);
    const existingDatabaseId = doc.addBlock(
      'affine:database',
      { title: new Text('Journal Todo') },
      existingNoteId
    );
    const { stub } = createStubStd({
      journalDate: undefined,
      isTemplateDoc: false,
      initialRef: { refDocId: doc.id, refBlockId: existingDatabaseId },
    });

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    const item = resolvedItems.find(i => i.name === 'Journal Todo');

    await (item as unknown as { action: () => Promise<void> }).action();
    await wait();

    const refEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    const seededView = refEl.model.props.views[0] as unknown as {
      filter?: { op: string; conditions: unknown[] };
    };
    expect(seededView.filter?.op).toBe('or');
    expect(seededView.filter?.conditions.length).toBe(2);
  });

  test('first invocation creates a fresh canonical database and inserts a filtered list view', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-07-29' });

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    const item = resolvedItems.find(i => i.name === 'Journal Todo');
    expect(item).toBeTruthy();

    await (item as unknown as { action: () => Promise<void> }).action();
    await wait();

    // The pointer was set to a real, freshly-created database.
    const ref = getRef();
    expect(ref).toBeTruthy();
    const canonicalModel = doc.getBlock(ref!.refBlockId)
      ?.model as DatabaseBlockModel;
    expect(canonicalModel?.flavour).toBe('affine:database');

    // A database-view-ref was inserted, seeded with a `list` view filtered
    // to hide done tasks.
    const refEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    expect(refEl).toBeTruthy();
    const refModel = refEl.model;
    expect(refModel.props.refBlockId).toBe(ref!.refBlockId);
    const seededView = refModel.props.views[0] as unknown as {
      mode: string;
      filter: { op: string; conditions: unknown[] };
    };
    expect(seededView.mode).toBe('list');
    // OR(not-done, done-after-this-reference-was-created) — see
    // `journalTodoDatabaseSlashMenuConfig`'s own comment for why this must
    // be an `or`, not a plain live "not done" filter.
    expect(seededView.filter.op).toBe('or');
    expect(seededView.filter.conditions.length).toBe(2);
  });

  describe('Story 2.7: "Show \'Due date\' in Journal todo" global setting, end-to-end', () => {
    // A real `EditorSettingExtension` (not a `getOptional` Proxy stub) —
    // needed because the visibility fix (see `list/pc/renderer.ts`'s
    // `render()`) resolves `std` via `EditorHostKey`/`this.host.std`, a
    // completely different path from the plain `std.getOptional(...)` call
    // this file's own `createStubStd` intercepts, and a `Command` handler's
    // `ctx.std` is bound by `CommandManager`'s own internal std reference
    // at construction time — neither path can be reliably intercepted by
    // wrapping the outer `editor.std` in a `Proxy` after the fact. Only a
    // genuinely-registered extension on the real editor works for both.
    beforeEach(async () => {
      const cleanup = await setupEditor('page', [
        EditorSettingExtension({
          setting$: signal({
            taskWorkflowDefaults: {
              database: { showDueDateColumn: true },
            },
          }),
        }),
      ]);
      return cleanup;
    });

    test('a freshly-invoked "Journal Todo" list actually renders the Due date field', async () => {
      const noteId = addNote(doc);
      const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
      const model = doc.getModelById(paragraphId)!;
      const { stub } = createStubStd({ journalDate: '2026-07-29' });

      const items = journalTodoDatabaseSlashMenuConfig.items;
      const resolvedItems =
        typeof items === 'function' ? items({ std: stub, model }) : items;
      const item = resolvedItems.find(i => i.name === 'Journal Todo');
      expect(item).toBeTruthy();

      await (item as unknown as { action: () => Promise<void> }).action();
      await wait();

      const refEl = document.querySelector(
        'affine-database-view-ref'
      ) as DatabaseViewRefBlockComponent;
      expect(refEl).toBeTruthy();

      // Detail fields render per-row — an empty list has none.
      const canonicalModel = doc.getBlock(refEl.model.props.refBlockId)
        ?.model as DatabaseBlockModel;
      const dataSource = new DatabaseBlockDataSource(canonicalModel);
      dataSource.rowAddAsTodoList('end');
      await wait();

      // The row-level detail-fields container only renders at all when
      // `detailProperties.length > 0` (`nothing` otherwise) — its own
      // `--affine-list-field-count` CSS variable directly reflects that
      // count, giving a precise, DOM-level assertion that the live
      // render-time override (not just the persisted, creation-time-only
      // hide flag) actually took effect.
      const fieldsEl = refEl.querySelector(
        '.affine-data-view-list-fields'
      ) as HTMLElement | null;
      expect(fieldsEl).toBeTruthy();
      expect(
        fieldsEl?.style.getPropertyValue('--affine-list-field-count')
      ).toBe('1');
    });
  });

  test('Story 2.7: "Journal Todo" eagerly ensures a Due date column exists on the canonical, so a Calendar view added later via the database\'s own normal view-switcher never needs a manual setup step', async () => {
    // Direct user correction (2026-08-07): there is no Journal-Todo-specific
    // "insert a calendar" command — the calendar is reached exclusively
    // through the database's own generic view-switcher (a plain, non-
    // Journal-Todo-aware `viewAdd('calendar')`), the same way any other
    // database gets a calendar view. This test guards the actual
    // requirement: by the time that generic switcher is used, Due date
    // must already exist so `CalendarDateMapping` resolves straight to
    // `'ready'`, never `'setup'`.
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-07-29' });

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    const item = resolvedItems.find(i => i.name === 'Journal Todo');
    expect(item).toBeTruthy();

    await (item as unknown as { action: () => Promise<void> }).action();
    await wait();

    const ref = getRef();
    expect(ref).toBeTruthy();
    const canonicalModel = doc.getBlock(ref!.refBlockId)
      ?.model as DatabaseBlockModel;
    const canonicalDataSource = new DatabaseBlockDataSource(canonicalModel);
    // Due date already exists — no manual setup needed once a calendar
    // view is added via the generic switcher.
    expect(canonicalDataSource.getDueDateColumn()).toBeTruthy();
  });

  test('Story 2.6: the "Note" column exists on the canonical after invocation, even when the canonical and its rows already existed beforehand', async () => {
    // Simulates the exact bug report this test guards against: a canonical
    // database whose rows were created via `rowAddAsTodoList` in an earlier
    // session, before this journal doc's own `/Journal Todo` was ever
    // invoked here. `ensureNoteColumn()` is otherwise only ever called
    // lazily from inside the Note cell's own create/reveal/attach actions,
    // which can't run until the column already exists — so without eagerly
    // ensuring it every time `/Journal Todo` resolves a canonical (mirroring
    // the same eager-ensure Status/Done date already get), the column, and
    // therefore the whole feature, would silently never appear on a
    // pre-existing table.
    const canonicalNoteId = addNote(doc);
    const canonicalDbId = doc.addBlock(
      'affine:database',
      { title: new Text('Journal Todo') },
      canonicalNoteId
    );
    const canonicalModel = doc.getBlock(canonicalDbId)
      ?.model as DatabaseBlockModel;
    const canonicalDataSource = new DatabaseBlockDataSource(canonicalModel);
    canonicalDataSource.rowAddAsTodoList('end');
    expect(canonicalDataSource.getNoteColumn()).toBeFalsy();

    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub } = createStubStd({
      journalDate: '2026-08-02',
      initialRef: { refDocId: doc.id, refBlockId: canonicalDbId },
    });

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    await (
      resolvedItems.find(i => i.name === 'Journal Todo') as unknown as {
        action: () => Promise<void>;
      }
    ).action();
    await wait();

    expect(canonicalDataSource.getNoteColumn()).toBeTruthy();

    // Regression: on an already-existing table (this scenario's whole
    // point), the Note column must land right after Status in the
    // canonical's own master column order — this is what table view's own
    // `materializeColumns` (`table-view-manager.ts`, applied the moment the
    // view is actually opened) uses to position any not-yet-explicitly-
    // listed property, so master order is what actually determines Note's
    // final on-screen position in table view (confirmed live: it was
    // showing up as the very first column instead).
    const noteColumnId = canonicalDataSource.getNoteColumn()!.id;
    const statusColumnId = canonicalDataSource.getTaskStatusColumn()!.id;
    const masterColumnIds = canonicalModel.props.columns.map(c => c.id);
    expect(masterColumnIds.indexOf(noteColumnId)).toBe(
      masterColumnIds.indexOf(statusColumnId) + 1
    );

    // And no stale, explicit hidden entry for Note is left sitting in a
    // table view's own stored `columns` order (the exact mechanism that
    // caused the original bug: an explicit `hide: true` entry, once
    // written, permanently overrides `materializeColumns`'s own ordering
    // fallback for that column). This raw `affine:database` block has no
    // view at all yet (only ever populated via `rowAddAsTodoList`) —
    // add one explicitly, mirroring how a user actually switches a
    // Journal Todo table to table mode.
    const tableViewId = canonicalDataSource.viewManager.viewAdd('table');
    const tableView = canonicalDataSource.viewDataList$.value.find(
      v => v.id === tableViewId
    )!;
    const tableColumns =
      (
        canonicalDataSource.viewDataGet(tableView.id) as unknown as {
          columns?: { id: string; hide?: boolean }[];
        }
      ).columns ?? [];
    const noteEntry = tableColumns.find(c => c.id === noteColumnId);
    expect(noteEntry?.hide).toBeFalsy();
  });

  test('Story 2.6: a row-level "attach a note" hover button renders in the list view (not a visible column) — per direct user feedback that a Note column should never be user-visible', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-08-02' });

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
    const rowId = dataSource.rowAddAsTodoList('end');
    await wait();

    // The seeded view is `list` mode (Story 2.4's own default) — the
    // hover button renders per-row there, not as a database column.
    const rowEl = document.querySelector(
      `[data-row-id="${rowId}"]`
    ) as HTMLElement | null;
    expect(rowEl).toBeTruthy();
    expect(
      rowEl?.querySelector('[data-testid="note-action-create"]')
    ).toBeTruthy();
  });

  test('Story 2.6: clicking "New note" from the hover button on a CROSS-DOC canonical creates the note-ref on the outer journal page, not silently inside the canonical\'s own (different) document', async () => {
    // Reproduces a real bug found via manual testing: `affine-database`
    // (and every cell renderer inside it) renders nested, inside
    // `affine-database-view-ref`'s own preview `BlockStdScope` — a fresh
    // scope over the canonical's own backing doc, which in the realistic
    // (and most common) case is a *different* doc than the journal page
    // the user is looking at. `EditorHostKey` used to resolve to that
    // nested preview's own host, so `std.store.addBlock(...)` (inside
    // `createNoteForRow`) silently created the note-ref inside the
    // canonical's own doc instead of the outer page — invisible to the
    // user. Fixed via `DatabaseViewRefBlockComponent.outerStd` (a duck
    // -typed getter database-block.ts's own lazy `dataSource` getter now
    // reads, mirroring `viewLocalOverride`'s own existing pattern).
    const secondDoc = collection
      .createDoc(
        `doc:journal-todo-canonical-${Math.random().toString(16).slice(2, 8)}`
      )
      .getStore();
    secondDoc.load(() => {
      const rootId = secondDoc.addBlock('affine:page', { title: new Text() });
      secondDoc.addBlock('affine:surface', {}, rootId);
    });
    const secondNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text('Journal Todo') },
      secondNoteId
    );
    const canonicalDataSource = new DatabaseBlockDataSource(
      secondDoc.getModelById(databaseId) as DatabaseBlockModel
    );
    canonicalDataSource.ensureTaskStatusColumn();
    const rowId = canonicalDataSource.rowAddAsTodoList('end');
    secondDoc.updateBlock(secondDoc.getModelById(rowId)!, {
      text: new Text('Cross-doc row'),
    });

    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub } = createStubStd({
      journalDate: '2026-08-03',
      initialRef: { refDocId: secondDoc.id, refBlockId: databaseId },
    });

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    await (
      resolvedItems.find(i => i.name === 'Journal Todo') as unknown as {
        action: () => Promise<void>;
      }
    ).action();
    await wait();

    const rowEl = document.querySelector(
      `[data-row-id="${rowId}"]`
    ) as HTMLElement | null;
    expect(rowEl).toBeTruthy();
    const createButton = rowEl?.querySelector(
      '[data-testid="note-action-create"]'
    ) as HTMLElement | null;
    expect(createButton).toBeTruthy();
    createButton?.click();
    await wait();

    const menuItems = Array.from(
      document.querySelectorAll('.affine-menu-action-text')
    );
    const newNoteItem = menuItems.find(
      el => el.textContent?.trim() === 'New note'
    );
    expect(newNoteItem).toBeTruthy();
    (newNoteItem?.closest('affine-menu-button') as HTMLElement | null)?.click();
    await wait();

    // The note-ref (and its canonical note) must land on the OUTER doc —
    // never inside the (cross-doc) canonical's own backing document.
    expect(doc.getBlocksByFlavour('affine:note-ref').length).toBeGreaterThan(0);
    expect(secondDoc.getBlocksByFlavour('affine:note-ref').length).toBe(0);
  });

  test("Story 2.6: clicking the note button for a row already linked to a note (from a cross-doc canonical) inserts the note-ref on THIS page, not the canonical's own doc — the exact mechanism a carried-over task in a new journal day relies on", async () => {
    // Directly answers the user's own question: when a task carries
    // forward into a new day's journal, its Note reference already points
    // at an existing note (set on some earlier day) — clicking the note
    // button there must reveal-or-insert that note at the end of *this*
    // page, using the exact same `std`/`outerStd` resolution the previous
    // test already proved correct for the "create new" path. This test
    // exercises the *other* branch (`revealOrInsertNoteForRow`, not
    // `createNoteForRow`) against a genuinely cross-doc canonical, so both
    // of `properties/note/actions.ts`'s insertion paths are proven, not
    // just one.
    const canonicalDoc = collection
      .createDoc(`doc:canonical-${Math.random().toString(16).slice(2, 8)}`)
      .getStore();
    canonicalDoc.load(() => {
      const rootId = canonicalDoc.addBlock('affine:page', {
        title: new Text(),
      });
      canonicalDoc.addBlock('affine:surface', {}, rootId);
    });
    const canonicalNoteId = addNote(canonicalDoc);
    const databaseId = canonicalDoc.addBlock(
      'affine:database',
      { title: new Text('Journal Todo') },
      canonicalNoteId
    );
    const canonicalDataSource = new DatabaseBlockDataSource(
      canonicalDoc.getModelById(databaseId) as DatabaseBlockModel
    );
    canonicalDataSource.ensureTaskStatusColumn();
    const rowId = canonicalDataSource.rowAddAsTodoList('end');
    canonicalDoc.updateBlock(canonicalDoc.getModelById(rowId)!, {
      text: new Text('Carried-over task'),
    });

    // A note already exists and is linked to this row — standing in for
    // "created on an earlier day," without re-testing creation itself
    // (already covered by the previous test).
    const existingNoteId = addNote(canonicalDoc);
    canonicalDataSource.setNoteRef(rowId, {
      refDocId: canonicalDoc.id,
      refBlockId: existingNoteId,
    });
    canonicalDataSource.setNoteColor(rowId, '#ff0000');

    // This page's own reference to the canonical — the row's Note
    // reference is already set (above), but this exact page has never
    // shown a `note-ref` for it before now.
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    editor.std.command.exec(insertDatabaseViewRefBlockCommand, {
      refBlockId: databaseId,
      refDocId: canonicalDoc.id,
      place: 'after',
      selectedModels: [model],
      initialView: { viewType: 'list' },
    });
    await wait();

    const rowEl = document.querySelector(
      `[data-row-id="${rowId}"]`
    ) as HTMLElement | null;
    expect(rowEl).toBeTruthy();
    // The row's own background reflects its assigned color the moment it
    // renders — *before* any note-ref for it exists on this page at all
    // (the whole point: the color is the visual cue that a task is
    // in-progress/has a note, independent of whether it's been revealed
    // here yet).
    expect(rowEl?.style.backgroundColor).toBeTruthy();
    // Populated state (note already linked) — a single click reveals-or
    // -inserts, no menu involved.
    const openButton = rowEl?.querySelector(
      '[data-testid="note-action-open"]'
    ) as HTMLElement | null;
    expect(openButton).toBeTruthy();
    // 999.9: the open-note button keeps the standard icon colour (same as the
    // due-date button next to it). Tinting it with the pale note colour made
    // it nearly invisible on dark themes; the row background already carries
    // the colour cue (asserted above).
    expect(openButton?.style.color).toBe('');
    openButton?.click();
    await wait();

    const insertedNoteRef = doc
      .getBlocksByFlavour('affine:note-ref')
      .find(
        block =>
          (block.model as unknown as { props: { refBlockId: string } }).props
            .refBlockId === existingNoteId
      );
    expect(insertedNoteRef).toBeTruthy();
    // The newly-inserted note-ref instance carries the row's own,
    // already-chosen color — not a freshly picked one, and not left at
    // the plain default background.
    expect(
      (
        insertedNoteRef!.model as unknown as {
          props: { backgroundOverride?: string };
        }
      ).props.backgroundOverride
    ).toBe('#ff0000');
    // Not created a second time inside the canonical's own doc.
    expect(
      canonicalDoc
        .getBlocksByFlavour('affine:note-ref')
        .some(
          block =>
            (block.model as unknown as { props: { refBlockId: string } }).props
              .refBlockId === existingNoteId
        )
    ).toBe(false);
  });

  test('second invocation reuses the same canonical database instead of creating a duplicate', async () => {
    const firstNoteId = addNote(doc);
    const firstParagraphId = doc.addBlock('affine:paragraph', {}, firstNoteId);
    const firstModel = doc.getModelById(firstParagraphId)!;
    const { stub: firstStub, getRef } = createStubStd({
      journalDate: '2026-07-28',
    });
    const items = journalTodoDatabaseSlashMenuConfig.items;
    const firstResolved =
      typeof items === 'function'
        ? items({ std: firstStub, model: firstModel })
        : items;
    await (
      firstResolved.find(i => i.name === 'Journal Todo') as unknown as {
        action: () => Promise<void>;
      }
    ).action();
    await wait();
    const firstRef = getRef()!;

    const secondNoteId = addNote(doc);
    const secondParagraphId = doc.addBlock(
      'affine:paragraph',
      {},
      secondNoteId
    );
    const secondModel = doc.getModelById(secondParagraphId)!;
    const stubForSecond = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) =>
            identifier === JournalTodoDatabaseProvider
              ? {
                  getJournalDate: () => '2026-07-29',
                  getJournalTodoDatabaseRef: () => firstRef,
                  setJournalTodoDatabaseRef: () => {
                    throw new Error('should not create a new pointer');
                  },
                }
              : undefined;
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const secondResolved =
      typeof items === 'function'
        ? items({ std: stubForSecond, model: secondModel })
        : items;
    await (
      secondResolved.find(i => i.name === 'Journal Todo') as unknown as {
        action: () => Promise<void>;
      }
    ).action();
    await wait();

    // Exactly one canonical database exists — the second invocation did
    // not create a duplicate.
    expect(doc.getBlocksByFlavour('affine:database').length).toBe(1);

    // Two independent database-view-ref instances now exist, both pointing
    // at the same canonical, each with its own local view.
    const refs = doc.getBlocksByFlavour('affine:database-view-ref');
    expect(refs.length).toBe(2);
    for (const ref of refs) {
      expect(
        (ref.model as unknown as { props: { refBlockId: string } }).props
          .refBlockId
      ).toBe(firstRef.refBlockId);
    }
  });

  test('marking a row done through the inserted view removes it from the filtered view without deleting it', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-07-29' });

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

    // Uses `rowAddAsTodoList` (the same call a real user interacting with
    // the seeded `'list'`-mode view produces) rather than a bare
    // `affine:paragraph` — a plain paragraph row rendered inside a live
    // `'list'`-mode view gets asynchronously converted to a todo
    // (`affine:list`) block by the view's own reactive `ensureTodoListRows`
    // (a `queueMicrotask`-deferred delete+recreate with the same id, see
    // `list-view-loop-repro.spec.ts`); creating the final row type directly
    // sidesteps that conversion race entirely rather than racing against it.
    const dataSource = new DatabaseBlockDataSource(canonicalModel);
    const rowId = dataSource.rowAddAsTodoList('end');
    await wait();

    // Row is genuinely on the canonical (writeback), matching Story 2.2's
    // own already-proven guarantee.
    expect(doc.getBlock(rowId)).toBeTruthy();

    dataSource.setTaskStatusChecked(rowId, true);
    await wait();

    // Row still exists — the row itself is never deleted by status
    // changes or filtering.
    expect(doc.getBlock(rowId)).toBeTruthy();
    expect(dataSource.getTaskStatusInfo(rowId)?.checked).toBe(true);

    // Marking done also stamps the hidden "Done date" column — the piece
    // the seeded OR-filter relies on to keep the row visible in *this*
    // reference while still excluding it from a later reference (see the
    // next two tests for the actual visibility behavior that produces).
    const doneDateColumnId = dataSource.ensureDoneDateColumn();
    expect(doneDateColumnId).toBeTruthy();
    const doneDateValue = doneDateColumnId
      ? getCell(canonicalModel, rowId, doneDateColumnId)?.value
      : undefined;
    expect(typeof doneDateValue).toBe('number');
  });

  test('clicking the Journal Todo row checkbox plays the same check animation as a normal todo list', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-07-29' });

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
    dataSource.rowAddAsTodoList('end');
    await wait();

    // Real DOM click on the actual rendered checkbox — not calling
    // `setTaskStatusChecked` directly — so this exercises the exact same
    // `onClick` handler wiring (`HeaderAreaTextCell.renderTaskStatusCheckbox`
    // in `properties/title/text.ts`) a real user interaction goes through.
    const checkbox = document.querySelector(
      '[data-testid="task-status-checkbox"]'
    ) as HTMLElement;
    expect(checkbox).toBeTruthy();
    expect(document.querySelector('.affine-check-animation')).toBeFalsy();

    checkbox.click();

    // `playCheckAnimation` (`@blocksuite/affine-components/icons`, the same
    // utility `affine:list`'s own todo checkbox uses) synchronously appends
    // its spark-burst element before its first `await` — present
    // immediately after the click, even though the animation itself
    // finishes and removes it a few hundred ms later.
    expect(document.querySelector('.affine-check-animation')).toBeTruthy();
  });

  test.each([
    ['a manually-inserted (non-template) reference', false, '2026-07-29'],
    ['a template-sourced reference', true, undefined],
  ] as const)(
    "Story 2.11: a row marked done stays visible in %s's own filtered view (the persisted OR grace clause, identical for both)",
    async (_label, isTemplateDoc, journalDate) => {
      const noteId = addNote(doc);
      const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
      const model = doc.getModelById(paragraphId)!;
      // A template doc's *first* `/Journal Todo` invocation refuses to
      // create a fresh canonical (Task 2 guard) — pre-seed an existing one
      // so both branches of this parametrized test reach the same
      // "reference an existing canonical" code path.
      let initialRef: { refDocId: string; refBlockId: string } | undefined;
      if (isTemplateDoc) {
        const existingNoteId = addNote(doc);
        const existingDatabaseId = doc.addBlock(
          'affine:database',
          { title: new Text('Journal Todo') },
          existingNoteId
        );
        initialRef = { refDocId: doc.id, refBlockId: existingDatabaseId };
      }
      const { stub, getRef } = createStubStd({
        journalDate,
        isTemplateDoc,
        initialRef,
      });

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
      const refEl = document.querySelector(
        'affine-database-view-ref'
      ) as DatabaseViewRefBlockComponent;
      const refModel = refEl.model;
      const override = createLocalViewOverride(refModel);
      const dataSource = new DatabaseBlockDataSource(canonicalModel, ds => {
        ds.serviceSet(DatabaseViewLocalOverrideProvider, override);
      });
      const rowId = dataSource.rowAddAsTodoList('end');
      const viewId = refModel.props.views[0].id;
      const view = dataSource.viewManager.viewGet(viewId)!;

      expect(view.rows$.value.map(r => r.rowId)).toContain(rowId);

      dataSource.setTaskStatusChecked(rowId, true);

      // Still shown in *this* reference/instance, even though the
      // persisted filter alone (plain "not done") would now exclude it —
      // identical outcome for template-sourced and manual insertions.
      expect(view.rows$.value.map(r => r.rowId)).toContain(rowId);
    }
  );

  test('Story 2.11 (live bug report — regression test): a row marked done is still visible after navigating away and back, not just in the instance that checked it off', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-07-29' });

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
    const refEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    const refModel = refEl.model;
    const override = createLocalViewOverride(refModel);
    const viewId = refModel.props.views[0].id;

    // First "rendered instance" (e.g. the tab the user checked the row off
    // in) sees it.
    const firstDataSource = new DatabaseBlockDataSource(canonicalModel, ds => {
      ds.serviceSet(DatabaseViewLocalOverrideProvider, override);
    });
    const rowId = firstDataSource.rowAddAsTodoList('end');
    firstDataSource.setTaskStatusChecked(rowId, true);
    const firstView = firstDataSource.viewManager.viewGet(viewId)!;
    expect(firstView.rows$.value.map(r => r.rowId)).toContain(rowId);

    // A brand-new `DatabaseBlockDataSource` instance over the exact same,
    // already-persisted view/filter — this is what happens on every page
    // navigation/reload (see `database-view-ref-block.ts`'s own
    // per-render `dataSource` lazy field). The row must *still* be
    // visible: the grace window is a property of the persisted filter
    // itself (this reference's own `referenceCreatedAtMs` literal, still
    // in the past relative to the row's Done date), not of any in-memory
    // state a fresh instance wouldn't have. A previous design (tried and
    // reverted this same story) moved the grace behavior into ephemeral,
    // non-persisted state instead — it broke exactly this: going back to
    // an old journal day no longer showed that day's own completed tasks,
    // only the still-undone ones, which is the live regression this test
    // guards against.
    const secondDataSource = new DatabaseBlockDataSource(canonicalModel, ds => {
      ds.serviceSet(DatabaseViewLocalOverrideProvider, override);
    });
    const secondView = secondDataSource.viewManager.viewGet(viewId)!;
    expect(secondView.rows$.value.map(r => r.rowId)).toContain(rowId);
  });

  test('Story 2.11 (live bug report — regression test): duplicating a database-view-ref (journal-template → new daily journal, or plain "Duplicate doc") refreshes its frozen grace-clause literal on the copy, without touching the source', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-07-29' });

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
    const sourceRefEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    const sourceRefModel = sourceRefEl.model;
    const sourceNoteModel = doc.getModelById(noteId)!;

    // Day 1: a row gets checked off "today". This must remain visible in
    // day 1's own reference forever after (see the previous test) — the
    // point of *this* test is that a fresh COPY of this reference,
    // produced later, must NOT show it, without ever touching day 1's own
    // filter.
    const sourceOverride = createLocalViewOverride(sourceRefModel);
    const sourceDataSource = new DatabaseBlockDataSource(canonicalModel, ds => {
      ds.serviceSet(DatabaseViewLocalOverrideProvider, sourceOverride);
    });
    const rowId = sourceDataSource.rowAddAsTodoList('end');
    sourceDataSource.setTaskStatusChecked(rowId, true);
    const viewId = sourceRefModel.props.views[0].id;
    const sourceView = sourceDataSource.viewManager.viewGet(viewId)!;
    expect(sourceView.rows$.value.map(r => r.rowId)).toContain(rowId);

    const sourceLiteralBefore = (
      sourceRefModel.props.views[0] as unknown as {
        filter: { conditions: { args: { value: number }[] }[] };
      }
    ).filter.conditions[1].args[0].value;

    // Day 2: duplicate the note containing this reference into a brand
    // new doc — the exact same `Slice`/`Transformer` mechanism
    // `DocsService.duplicateFromTemplate`/`.duplicate()` use in
    // `packages/frontend/core`, with the same middleware wired in. Force
    // "now" to be well after the row was checked off, so the assertions
    // below can't flake on millisecond-level timing.
    const duplicatedAtMs = Date.now() + 100_000;
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(duplicatedAtMs);
    try {
      const targetDoc = collection
        .createDoc(
          `doc:journal-todo-duplicate-target-${Math.random().toString(16).slice(2, 8)}`
        )
        .getStore();
      targetDoc.load(() => {
        const rootId = targetDoc.addBlock('affine:page', {
          title: new Text(),
        });
        targetDoc.addBlock('affine:surface', {}, rootId);
      });

      const transformer = new Transformer({
        schema: new Schema().register(AffineSchemas),
        blobCRUD: collection.blobSync,
        docCRUD: {
          create: (id: string) => collection.createDoc(id).getStore({ id }),
          get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
          delete: (id: string) => collection.removeDoc(id),
        },
        middlewares: [
          replaceIdMiddleware(collection.idGenerator),
          refreshJournalTodoOnDuplicateMiddleware(),
        ],
      });
      const slice = Slice.fromModels(doc, [sourceNoteModel]);
      const snapshot = transformer.sliceToSnapshot(slice);
      if (!snapshot) throw new Error('Failed to create snapshot');
      await transformer.snapshotToSlice(
        snapshot,
        targetDoc,
        targetDoc.root?.id
      );

      const duplicatedRefEl = targetDoc.getBlocksByFlavour(
        'affine:database-view-ref'
      )[0];
      const duplicatedRefModel =
        duplicatedRefEl.model as unknown as typeof sourceRefModel;

      // Still points at the exact same shared canonical — duplication
      // never touches `refBlockId`/`refDocId` (no `replaceIdMiddleware`
      // case for this block flavour, by design — see that middleware's
      // own comment).
      expect(duplicatedRefModel.props.refBlockId).toBe(
        sourceRefModel.props.refBlockId
      );

      const duplicatedLiteral = (
        duplicatedRefModel.props.views[0] as unknown as {
          filter: { conditions: { args: { value: number }[] }[] };
        }
      ).filter.conditions[1].args[0].value;
      expect(duplicatedLiteral).toBe(duplicatedAtMs - 1);
      expect(duplicatedLiteral).not.toBe(sourceLiteralBefore);

      // The copy's own view now excludes the row done "yesterday" — a
      // fresh `DatabaseBlockDataSource` scoped to the copy's own local
      // view override.
      const duplicatedOverride = createLocalViewOverride(duplicatedRefModel);
      const duplicatedDataSource = new DatabaseBlockDataSource(
        canonicalModel,
        ds => {
          ds.serviceSet(DatabaseViewLocalOverrideProvider, duplicatedOverride);
        }
      );
      const duplicatedView = duplicatedDataSource.viewManager.viewGet(viewId)!;
      expect(duplicatedView.rows$.value.map(r => r.rowId)).not.toContain(rowId);

      // The source's own filter/view (day 1's own reference) was never
      // touched by duplicating a copy of it.
      expect(
        (
          sourceRefModel.props.views[0] as unknown as {
            filter: { conditions: { args: { value: number }[] }[] };
          }
        ).filter.conditions[1].args[0].value
      ).toBe(sourceLiteralBefore);
      const sourceViewAfter = sourceDataSource.viewManager.viewGet(viewId)!;
      expect(sourceViewAfter.rows$.value.map(r => r.rowId)).toContain(rowId);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  test("a Journal Todo copied from a template is re-pointed at the CURRENT Journal Todo table, with its filter on that table's columns", async () => {
    // Live bug (2026-10-28): template -> new journal kept referencing the
    // table the template was built against, even after "New Journal Todo
    // Table" had switched the workspace to a newer one. Only copies made by
    // duplication are re-pointed; already-inserted references stay put.
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-10-28' });

    const todoItems = journalTodoDatabaseSlashMenuConfig.items;
    await (
      (typeof todoItems === 'function'
        ? todoItems({ std: stub, model })
        : todoItems
      ).find(i => i.name === 'Journal Todo') as unknown as {
        action: () => Promise<void>;
      }
    ).action();
    await wait();
    const tableA = getRef()!;
    const sourceRefModel = (
      document.querySelector(
        'affine-database-view-ref'
      ) as DatabaseViewRefBlockComponent
    ).model;
    expect(sourceRefModel.props.refBlockId).toBe(tableA.refBlockId);

    // Switch the workspace to a brand-new table B.
    const otherNoteId = addNote(doc);
    const otherParagraph = doc.getModelById(
      doc.addBlock('affine:paragraph', {}, otherNoteId)
    )!;
    const sourceItems = journalTodoSourceSlashMenuConfig.items;
    (
      (typeof sourceItems === 'function'
        ? sourceItems({ std: stub, model: otherParagraph })
        : sourceItems
      ).find(i => i.name === 'New Journal Todo Table') as unknown as {
        action: () => void;
      }
    ).action();
    await wait();
    const tableB = getRef()!;
    expect(tableB.refBlockId).not.toBe(tableA.refBlockId);

    // "New journal from template": duplicate the note holding the old
    // reference, with the current source handed to the middleware the way
    // DocsService does.
    const targetDoc = collection
      .createDoc(
        `doc:journal-todo-repoint-${Math.random().toString(16).slice(2, 8)}`
      )
      .getStore();
    targetDoc.load(() => {
      const rootId = targetDoc.addBlock('affine:page', { title: new Text() });
      targetDoc.addBlock('affine:surface', {}, rootId);
    });
    const transformer = new Transformer({
      schema: new Schema().register(AffineSchemas),
      blobCRUD: collection.blobSync,
      docCRUD: {
        create: (id: string) => collection.createDoc(id).getStore({ id }),
        get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
        delete: (id: string) => collection.removeDoc(id),
      },
      middlewares: [
        replaceIdMiddleware(collection.idGenerator),
        refreshJournalTodoOnDuplicateMiddleware({
          getCurrentSource: () => getRef(),
        }),
      ],
    });
    const snapshot = transformer.sliceToSnapshot(
      Slice.fromModels(doc, [doc.getModelById(noteId)!])
    );
    if (!snapshot) throw new Error('Failed to create snapshot');
    await transformer.snapshotToSlice(snapshot, targetDoc, targetDoc.root?.id);
    await wait(50);

    const copy = targetDoc.getBlocksByFlavour('affine:database-view-ref')[0]!
      .model as unknown as typeof sourceRefModel;
    expect(copy.props.refBlockId).toBe(tableB.refBlockId);
    expect(copy.props.refDocId).toBe(tableB.refDocId);

    const tableBModel = doc.getBlock(tableB.refBlockId)!
      .model as DatabaseBlockModel;
    const tableBSource = new DatabaseBlockDataSource(tableBModel);
    const statusColumnId = tableBSource.getTaskStatusColumn()!.id;
    const doneOptionId = tableBSource.getTaskStatusTargetOption(
      'done',
      statusColumnId
    )!.id;
    const filter = (
      copy.props.views[0] as unknown as {
        filter: {
          op: string;
          conditions: {
            left: { name: string };
            function: string;
            args: { value: unknown }[];
          }[];
        };
      }
    ).filter;
    expect(filter.op).toBe('or');
    const statusClause = filter.conditions.find(
      c => c.function === 'isNotOneOf'
    )!;
    expect(statusClause.left.name).toBe(statusColumnId);
    expect(statusClause.args[0]!.value).toEqual([doneOptionId]);
    const doneDateClause = filter.conditions.find(c => c.function === 'after')!;
    expect(doneDateClause.left.name).toBe(tableBSource.getDoneDateColumn()!.id);

    // The original (e.g. the template itself) still points at table A.
    expect(sourceRefModel.props.refBlockId).toBe(tableA.refBlockId);
  });

  test('Story 2.11 (live bug report — regression test): "Note color" gets hidden in any reference that touches it, even if the column already exists from a different reference', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-07-29' });

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
    const refEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    const refModel = refEl.model;

    const findHide = (viewModel: unknown, columnId: string) => {
      const view = viewModel as { columns?: { id: string; hide?: boolean }[] };
      return view.columns?.find(c => c.id === columnId)?.hide;
    };

    // Simulate "Note color" already existing globally, created via some
    // other, unrelated reference/context (the canonical's own default,
    // un-overridden view here) that never touched *this* reference's own
    // view — this reference's own view genuinely has no hide entry for it
    // yet, matching the live bug's starting state.
    const noteColorColumnId = new DatabaseBlockDataSource(
      canonicalModel
    ).ensureNoteColorColumn()!;
    expect(noteColorColumnId).toBeTruthy();
    expect(findHide(refModel.props.views[0], noteColorColumnId)).not.toBe(true);

    // *This* reference's own dataSource, scoped via its local view
    // override — the real code path `createNoteForRow`/
    // `attachExistingNoteForRow`/`setNoteColor` use — calling
    // `ensureNoteColorColumn()` through it must self-correct the hide
    // state for its own view, even though the column already existed.
    const refScopedDataSource = new DatabaseBlockDataSource(
      canonicalModel,
      ds => {
        ds.serviceSet(
          DatabaseViewLocalOverrideProvider,
          createLocalViewOverride(refModel)
        );
      }
    );
    refScopedDataSource.ensureNoteColorColumn();

    expect(findHide(refModel.props.views[0], noteColorColumnId)).toBe(true);
  });

  test('Story 2.11 (live bug report — regression test): duplicating a database-view-ref also hides "Note color" on the copy, without touching the source', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-07-29' });

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
    const sourceRefEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    const sourceRefModel = sourceRefEl.model;
    const sourceNoteModel = doc.getModelById(noteId)!;

    const findHide = (viewModel: unknown, columnId: string) => {
      const view = viewModel as { columns?: { id: string; hide?: boolean }[] };
      return view.columns?.find(c => c.id === columnId)?.hide;
    };

    // "Note color" comes into existence *after* this source reference's
    // own view was already created — matches a real journal template,
    // whose own view is seeded long before any note is ever attached to
    // any of its rows. The source's own view genuinely never got the
    // hide, matching the live bug's actual starting state.
    const noteColorColumnId = new DatabaseBlockDataSource(
      canonicalModel
    ).ensureNoteColorColumn()!;
    expect(findHide(sourceRefModel.props.views[0], noteColorColumnId)).not.toBe(
      true
    );

    const targetDoc = collection
      .createDoc(
        `doc:journal-todo-duplicate-note-color-${Math.random().toString(16).slice(2, 8)}`
      )
      .getStore();
    targetDoc.load(() => {
      const rootId = targetDoc.addBlock('affine:page', { title: new Text() });
      targetDoc.addBlock('affine:surface', {}, rootId);
    });

    const transformer = new Transformer({
      schema: new Schema().register(AffineSchemas),
      blobCRUD: collection.blobSync,
      docCRUD: {
        create: (id: string) => collection.createDoc(id).getStore({ id }),
        get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
        delete: (id: string) => collection.removeDoc(id),
      },
      middlewares: [
        replaceIdMiddleware(collection.idGenerator),
        refreshJournalTodoOnDuplicateMiddleware(),
      ],
    });
    const slice = Slice.fromModels(doc, [sourceNoteModel]);
    const snapshot = transformer.sliceToSnapshot(slice);
    if (!snapshot) throw new Error('Failed to create snapshot');
    await transformer.snapshotToSlice(snapshot, targetDoc, targetDoc.root?.id);

    const duplicatedRefEl = targetDoc.getBlocksByFlavour(
      'affine:database-view-ref'
    )[0];
    const duplicatedRefModel =
      duplicatedRefEl.model as unknown as typeof sourceRefModel;

    // The copy gets it hidden...
    expect(findHide(duplicatedRefModel.props.views[0], noteColorColumnId)).toBe(
      true
    );
    // ...without the source's own (still-not-hidden) view being touched.
    expect(findHide(sourceRefModel.props.views[0], noteColorColumnId)).not.toBe(
      true
    );
  });

  test('Story 2.11 (live bug report — regression test, "auto-selected-today" bug): a duplicated database-view-ref whose canonical host doc has not finished loading yet still gets fixed once loading catches up', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-07-29' });

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
    const sourceRefEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    const sourceRefModel = sourceRefEl.model;
    const sourceNoteModel = doc.getModelById(noteId)!;

    // Exercise both fixes at once, same as the sibling "Note color" test
    // above.
    const noteColorColumnId = new DatabaseBlockDataSource(
      canonicalModel
    ).ensureNoteColorColumn()!;

    const duplicatedAtMs = Date.now() + 100_000;
    const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(duplicatedAtMs);
    // Simulate the canonical's host doc (`doc` — treated as already warm by
    // every other test in this file) NOT having finished loading its
    // content yet this session — the exact "auto-selected-today" race:
    // `workspace.getDoc()` returns a handle, but `getStore().getBlock()`
    // finds nothing for the canonical block until content actually streams
    // in. `doc.getStore({ id: doc.id })` is memoized per id
    // (`StoreContainer.getStore`), so grabbing it once and spying on its
    // `getBlock` directly (rather than wrapping the whole `Store` in a
    // Proxy, which would break `this`-bound private-field access on every
    // *other* method) reaches both call sites that matter — the
    // middleware's own initial synchronous check, and `waitForBlockInDoc`'s
    // retry — since both resolve the exact same cached `Store` instance.
    // Only the canonical's own block id is gated, so unrelated lookups
    // (root, surface, the source reference itself) are unaffected.
    let loaded = false;
    const realStore = doc.doc.getStore({ id: doc.id });
    const originalGetBlock = realStore.getBlock.bind(realStore);
    const getBlockSpy = vi
      .spyOn(realStore, 'getBlock')
      .mockImplementation((id: string) =>
        id === ref.refBlockId && !loaded ? undefined : originalGetBlock(id)
      );
    try {
      const targetDoc = collection
        .createDoc(
          `doc:journal-todo-duplicate-cold-canonical-${Math.random().toString(16).slice(2, 8)}`
        )
        .getStore();
      targetDoc.load(() => {
        const rootId = targetDoc.addBlock('affine:page', {
          title: new Text(),
        });
        targetDoc.addBlock('affine:surface', {}, rootId);
      });

      const transformer = new Transformer({
        schema: new Schema().register(AffineSchemas),
        blobCRUD: collection.blobSync,
        docCRUD: {
          create: (id: string) => collection.createDoc(id).getStore({ id }),
          get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
          delete: (id: string) => collection.removeDoc(id),
        },
        middlewares: [
          replaceIdMiddleware(collection.idGenerator),
          refreshJournalTodoOnDuplicateMiddleware(),
        ],
      });
      const slice = Slice.fromModels(doc, [sourceNoteModel]);
      const snapshot = transformer.sliceToSnapshot(slice);
      if (!snapshot) throw new Error('Failed to create snapshot');
      await transformer.snapshotToSlice(
        snapshot,
        targetDoc,
        targetDoc.root?.id
      );

      const duplicatedRefEl = targetDoc.getBlocksByFlavour(
        'affine:database-view-ref'
      )[0];
      const duplicatedRefModel =
        duplicatedRefEl.model as unknown as typeof sourceRefModel;

      const findHide = (viewModel: unknown, columnId: string) => {
        const view = viewModel as {
          columns?: { id: string; hide?: boolean }[];
        };
        return view.columns?.find(c => c.id === columnId)?.hide;
      };
      const readLiteral = (viewModel: unknown) =>
        (
          viewModel as {
            filter: { conditions: { args: { value: number }[] }[] };
          }
        ).filter.conditions[1].args[0].value;

      // Immediately after duplication completes, the canonical still isn't
      // resolvable (doc not "loaded" yet) — both fixes must have been
      // skipped, not crashed or half-applied.
      expect(readLiteral(duplicatedRefModel.props.views[0])).not.toBe(
        duplicatedAtMs - 1
      );
      expect(
        findHide(duplicatedRefModel.props.views[0], noteColorColumnId)
      ).not.toBe(true);

      // Loading "finishes" (content streams in) — the retry must pick this
      // up and apply both fixes, without anything else re-triggering it.
      // `waitForBlockInDoc` re-checks on the canonical doc's own Yjs
      // `update` event (debounced 300ms), so a real, harmless mutation is
      // needed to fire one — flipping `loaded` alone wouldn't wake it up.
      loaded = true;
      doc.spaceDoc.transact(() => {
        doc.spaceDoc
          .getMap('__test_journal_todo_load_signal__')
          .set('x', Date.now());
      });
      await wait(500);

      expect(readLiteral(duplicatedRefModel.props.views[0])).toBe(
        duplicatedAtMs - 1
      );
      expect(
        findHide(duplicatedRefModel.props.views[0], noteColorColumnId)
      ).toBe(true);
    } finally {
      dateNowSpy.mockRestore();
      getBlockSpy.mockRestore();
    }
  });

  test('the seeded list view hides Hierarchy/Parent/Ancestor and Done date columns; a table view added afterwards keeps Done date visible', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({ journalDate: '2026-07-29' });

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
    const rowId = dataSource.rowAddAsTodoList('end');
    dataSource.setTaskStatusChecked(rowId, true); // ensures Done date column exists
    await wait();

    const refEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    const refModel = refEl.model;
    const doneDateColumnId = dataSource.ensureDoneDateColumn()!;
    const statusColumnId = dataSource.getTaskStatusColumn()!.id;

    const findHide = (viewIndex: number, columnId: string) => {
      const view = refModel.props.views[viewIndex] as unknown as {
        columns?: { id: string; hide?: boolean }[];
      };
      return view.columns?.find(c => c.id === columnId)?.hide;
    };

    // Seeded (list) view: Done date and Status are hidden, per the same
    // policy the canonical database's own views already follow — this
    // previously failed to propagate to a `database-view-ref`'s own
    // per-instance view (`hideDefaultHiddenColumnsForNewView` only ever
    // wrote to the canonical's own `views`, never through the ref's own
    // `DatabaseViewLocalOverrideProvider`-backed view storage).
    expect(findHide(0, doneDateColumnId)).toBe(true);
    expect(findHide(0, statusColumnId)).toBe(true);

    // Adding a Table view within this same ref instance (mirrors a user
    // clicking "Add view" -> Table, i.e. going through the ref's own
    // `DatabaseViewLocalOverrideProvider`-backed view storage) must also
    // get correct hide-state, and Done date/Status should be visible
    // there, not hidden.
    const override = createLocalViewOverride(refModel);
    const refScopedDataSource = new DatabaseBlockDataSource(
      canonicalModel,
      ds => {
        ds.serviceSet(DatabaseViewLocalOverrideProvider, override);
      }
    );
    const tableViewId = refScopedDataSource.viewManager.viewAdd('table');
    const tableViewIndex = refModel.props.views.findIndex(
      v => v.id === tableViewId
    );
    expect(findHide(tableViewIndex, doneDateColumnId)).not.toBe(true);
    expect(findHide(tableViewIndex, statusColumnId)).not.toBe(true);
  });

  test('reusing a canonical that lives in a different doc still seeds a real filter (cross-doc resolution)', async () => {
    // Every day after the first, the canonical lives in whichever journal
    // doc first created it — never today's doc. Resolving `canonicalModel`
    // synchronously (no wait for the target doc to load) previously left
    // `initialFilter` `undefined` whenever that doc hadn't finished
    // loading, silently seeding a view with no filter at all. This proves
    // the cross-doc branch (`ensureDocLoaded`/`waitForBlockInDoc`) still
    // produces a real, non-empty filter when reusing a canonical that
    // lives in another doc entirely.
    const secondDoc = collection
      .createDoc(
        `doc:journal-todo-canonical-${Math.random().toString(16).slice(2, 8)}`
      )
      .getStore();
    secondDoc.load(() => {
      const rootId = secondDoc.addBlock('affine:page', { title: new Text() });
      secondDoc.addBlock('affine:surface', {}, rootId);
    });
    const secondNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text('Journal Todo') },
      secondNoteId
    );
    new DatabaseBlockDataSource(
      secondDoc.getModelById(databaseId) as DatabaseBlockModel
    ).ensureTaskStatusColumn();

    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub } = createStubStd({
      journalDate: '2026-07-30',
      initialRef: { refDocId: secondDoc.id, refBlockId: databaseId },
    });

    const items = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    await (
      resolvedItems.find(i => i.name === 'Journal Todo') as unknown as {
        action: () => Promise<void>;
      }
    ).action();
    await wait();

    const refEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    expect(refEl).toBeTruthy();
    const seededView = refEl.model.props.views[0] as unknown as {
      mode: string;
      filter?: { op: string; conditions: unknown[] };
    };
    expect(seededView.mode).toBe('list');
    expect(seededView.filter?.op).toBe('or');
    expect(seededView.filter?.conditions.length).toBe(2);
  });
});

// Story 2.5.5: lets the user explicitly set (or create) "the current
// journal todo database" pointer themselves, instead of only ever getting
// whatever `journalTodoDatabaseSlashMenuConfig`'s own first-ever-use
// auto-create silently produced. These items only ever mutate the
// pointer — they never insert a filtered reference themselves (that
// remains exclusively `journalTodoDatabaseSlashMenuConfig`'s own job).
describe('journal todo source selection (Story 2.5.5)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  function createStubStd(options: {
    initialRef?: { refDocId: string; refBlockId: string };
    // Story 2.11 (post-review): a plain boolean applies uniformly to every
    // docId queried (matches every prior test's needs — the invoking doc's
    // own template status). A function lets a test distinguish by docId
    // (e.g. "the invoking doc isn't a template, but the picked candidate's
    // doc is") or return different answers on successive calls (simulating
    // the doc's template status changing between menu-build and click).
    isTemplateDoc?: boolean | ((docId: string) => boolean);
  }) {
    let ref = options.initialRef;
    const stub = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) =>
            identifier === JournalTodoDatabaseProvider
              ? {
                  getJournalDate: () => undefined,
                  getJournalTodoDatabaseRef: () => ref,
                  setJournalTodoDatabaseRef: (newRef: typeof ref) => {
                    ref = newRef;
                  },
                  isTemplateDoc: (docId: string) =>
                    typeof options.isTemplateDoc === 'function'
                      ? options.isTemplateDoc(docId)
                      : (options.isTemplateDoc ?? false),
                }
              : undefined;
        }
        if (prop === 'host') {
          // Story 2.11 (post-review): needed so the new template-guard
          // refusal toasts (which read `.host.store`, a private-field-
          // backed getter) don't crash — same fix as the outer describe
          // block's own `createStubStd`.
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

  function createCrossDocStub(
    resolveTo: {
      docId: string;
      blockId: string;
      flavour: 'affine:database';
    } | null,
    onOpen?: (
      excludeDocId: string | null,
      allowedFlavours?: readonly string[]
    ) => void
  ) {
    return {
      openCrossDocReferencePicker: async (
        excludeDocId: string | null,
        allowedFlavours?: readonly string[]
      ) => {
        onOpen?.(excludeDocId, allowedFlavours);
        return resolveTo;
      },
    };
  }

  test('offers "Set Journal Todo Table" and "New Journal Todo Table" items even outside a journal doc (no journal-date gate)', () => {
    const anchorNoteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, anchorNoteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub } = createStubStd({});

    const items = journalTodoSourceSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    expect(
      resolvedItems.find(item => item.name === 'Set Journal Todo Table')
    ).toBeTruthy();
    expect(
      resolvedItems.find(item => item.name === 'New Journal Todo Table')
    ).toBeTruthy();
  });

  test('Story 2.11: "New Journal Todo Table" is omitted from a template doc, but "Set Journal Todo Table" remains offered', () => {
    const anchorNoteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, anchorNoteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub } = createStubStd({ isTemplateDoc: true });

    const items = journalTodoSourceSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    expect(
      resolvedItems.find(item => item.name === 'Set Journal Todo Table')
    ).toBeTruthy();
    expect(
      resolvedItems.find(item => item.name === 'New Journal Todo Table')
    ).toBeFalsy();
  });

  test('Story 2.11 (post-review): "Set Journal Todo Table" refuses a picked candidate that itself lives inside a template doc, even from a non-template invoking doc', async () => {
    const anchorNoteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, anchorNoteId);
    const model = doc.getModelById(paragraphId)!;
    // The invoking doc (`doc`) is NOT a template; only the *picked
    // candidate's* doc is — this is exactly the gap a per-invoking-doc-only
    // check would miss.
    const templateDocId = 'doc:some-template';
    const { stub, getRef } = createStubStd({
      isTemplateDoc: docId => docId === templateDocId,
    });

    const stubStd = new Proxy(stub, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) => {
            if (identifier === CrossDocReferenceProvider) {
              return createCrossDocStub({
                docId: templateDocId,
                blockId: 'some-database-in-the-template',
                flavour: 'affine:database',
              });
            }
            return Reflect.get(
              target,
              'getOptional',
              receiver
            )(identifier as GeneralServiceIdentifier<unknown>);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const items = journalTodoSourceSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stubStd, model }) : items;
    const item = resolvedItems.find(
      i => i.name === 'Set Journal Todo Table'
    ) as unknown as { action: () => Promise<void> };

    await item.action();
    await wait();

    expect(getRef()).toBeUndefined();
    // Not asserting toast content (see the stale-ref test's own comment
    // above, in the sibling describe block, for why).
  });

  test('Story 2.11 (post-review): "New Journal Todo Table" re-checks template status at click time, not just when the menu was built', async () => {
    const anchorNoteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, anchorNoteId);
    const model = doc.getModelById(paragraphId)!;
    // Not a template when the menu is built (so the item is offered), but
    // becomes one before the click resolves — simulates the doc's template
    // flag flipping in the gap between menu-open and click.
    let isTemplateNow = false;
    const { stub, getRef } = createStubStd({
      isTemplateDoc: () => isTemplateNow,
    });

    const items = journalTodoSourceSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    const item = resolvedItems.find(
      i => i.name === 'New Journal Todo Table'
    ) as unknown as { action: () => void };
    expect(item).toBeTruthy();

    isTemplateNow = true;
    const databaseCountBefore =
      doc.getBlocksByFlavour('affine:database').length;
    item.action();
    await wait();

    expect(doc.getBlocksByFlavour('affine:database').length).toBe(
      databaseCountBefore
    );
    expect(getRef()).toBeUndefined();
    // Not asserting toast content (see the stale-ref test's own comment
    // in the sibling describe block for why).
  });

  test('"Set Journal Todo Table" opens one picker excluding nothing (same-doc tables included), sets the pointer to a same-doc pick without inserting any block', async () => {
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text('My Table') },
      noteId
    );
    const anchorNoteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, anchorNoteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({});

    let capturedExcludeDocId: string | null | undefined;
    const stubStd = new Proxy(stub, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) => {
            if (identifier === CrossDocReferenceProvider) {
              return createCrossDocStub(
                {
                  docId: doc.id,
                  blockId: databaseId,
                  flavour: 'affine:database',
                },
                excludeDocId => {
                  capturedExcludeDocId = excludeDocId;
                }
              );
            }
            return Reflect.get(
              target,
              'getOptional',
              receiver
            )(identifier as GeneralServiceIdentifier<unknown>);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const items = journalTodoSourceSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stubStd, model }) : items;
    const item = resolvedItems.find(
      i => i.name === 'Set Journal Todo Table'
    ) as unknown as { action: () => Promise<void> };

    const refCountBefore = doc.getBlocksByFlavour(
      'affine:database-view-ref'
    ).length;
    await item.action();
    await wait();

    // `null` means "exclude nothing" — same-doc candidates are included in
    // the same picker as cross-doc ones, per the consolidated single-item
    // design.
    expect(capturedExcludeDocId).toBeNull();
    expect(getRef()).toEqual({ refDocId: doc.id, refBlockId: databaseId });
    expect(doc.getBlocksByFlavour('affine:database-view-ref').length).toBe(
      refCountBefore
    );
  });

  test('"Set Journal Todo Table" restricts the picker to databases and sets the pointer to a cross-doc pick without inserting any block', async () => {
    const secondDoc = collection
      .createDoc(`doc:second-${Math.random().toString(16).slice(2, 8)}`)
      .getStore();
    secondDoc.load(() => {
      const rootId = secondDoc.addBlock('affine:page', { title: new Text() });
      secondDoc.addBlock('affine:surface', {}, rootId);
    });
    const secondNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text() },
      secondNoteId
    );

    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;

    let capturedAllowedFlavours: readonly string[] | undefined;
    const stubStd = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) => {
            if (identifier === JournalTodoDatabaseProvider) {
              return {
                getJournalDate: () => undefined,
                getJournalTodoDatabaseRef: () => undefined,
                setJournalTodoDatabaseRef: () => {},
                isTemplateDoc: () => false,
              };
            }
            if (identifier === CrossDocReferenceProvider) {
              return createCrossDocStub(
                {
                  docId: secondDoc.id,
                  blockId: databaseId,
                  flavour: 'affine:database',
                },
                (_excludeDocId, allowedFlavours) => {
                  capturedAllowedFlavours = allowedFlavours;
                }
              );
            }
            return undefined;
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const items = journalTodoSourceSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stubStd, model }) : items;
    const item = resolvedItems.find(
      i => i.name === 'Set Journal Todo Table'
    ) as unknown as { action: () => Promise<void> };

    const refCountBefore = doc.getBlocksByFlavour(
      'affine:database-view-ref'
    ).length;
    await item.action();
    await wait();

    expect(capturedAllowedFlavours).toEqual(['affine:database']);
    expect(doc.getBlocksByFlavour('affine:database-view-ref').length).toBe(
      refCountBefore
    );
  });

  test('"New Journal Todo Table" creates a visible table and sets the pointer, replacing a prior value', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({
      initialRef: { refDocId: 'doc:old', refBlockId: 'old-database' },
    });

    const items = journalTodoSourceSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stub, model }) : items;
    const item = resolvedItems.find(
      i => i.name === 'New Journal Todo Table'
    ) as unknown as { action: () => void };

    item.action();
    await wait();

    const newRef = getRef()!;
    expect(newRef.refBlockId).not.toBe('old-database');
    expect(newRef.refDocId).toBe(doc.id);
    // Visible (not wrapped in a hidden EdgelessOnly note) — a deliberate,
    // visible user action, unlike the silent first-use auto-create.
    const newTableModel = doc.getBlock(newRef.refBlockId)!.model;
    expect(newTableModel.flavour).toBe('affine:database');
    const parentNote = doc.getParent(newTableModel) as unknown as {
      props: { displayMode?: string };
    };
    expect(parentNote.props.displayMode).not.toBe('edgeless');
  });

  test('carryover: setting the pointer via a new-source action makes the very next "Journal Todo" invocation resolve to it (simulating the next day)', async () => {
    // First, set a source via this story's own "New Journal Todo Table".
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;
    const { stub, getRef } = createStubStd({});

    const sourceItems = journalTodoSourceSlashMenuConfig.items;
    const resolvedSourceItems =
      typeof sourceItems === 'function'
        ? sourceItems({ std: stub, model })
        : sourceItems;
    const newSourceItem = resolvedSourceItems.find(
      i => i.name === 'New Journal Todo Table'
    ) as unknown as { action: () => void };
    newSourceItem.action();
    await wait();
    const chosenRef = getRef()!;

    // Now simulate "the next day's journal" — a different journal doc,
    // invoking `/Journal Todo` fresh, reusing the same pointer store (the
    // stub's own closed-over `ref` variable is the pointer here).
    const laterNoteId = addNote(doc);
    const laterParagraphId = doc.addBlock('affine:paragraph', {}, laterNoteId);
    const laterModel = doc.getModelById(laterParagraphId)!;
    const laterStub = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) =>
            identifier === JournalTodoDatabaseProvider
              ? {
                  getJournalDate: () => '2026-07-31',
                  getJournalTodoDatabaseRef: () => chosenRef,
                  setJournalTodoDatabaseRef: () => {
                    throw new Error(
                      'should not create a new pointer — the chosen source should carry over'
                    );
                  },
                }
              : undefined;
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const todoItems = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedTodoItems =
      typeof todoItems === 'function'
        ? todoItems({ std: laterStub, model: laterModel })
        : todoItems;
    await (
      resolvedTodoItems.find(i => i.name === 'Journal Todo') as unknown as {
        action: () => Promise<void>;
      }
    ).action();
    await wait();

    const refEls = document.querySelectorAll('affine-database-view-ref');
    const insertedRef = Array.from(refEls)
      .map(el => (el as DatabaseViewRefBlockComponent).model)
      .find(m => m.props.refBlockId === chosenRef.refBlockId);
    expect(insertedRef).toBeTruthy();
  });

  test('switching the source does not retroactively repoint an already-inserted database-view-ref', async () => {
    let ref: { refDocId: string; refBlockId: string } | undefined;
    const stub = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) =>
            identifier === JournalTodoDatabaseProvider
              ? {
                  getJournalDate: () => '2026-07-30',
                  getJournalTodoDatabaseRef: () => ref,
                  setJournalTodoDatabaseRef: (newRef: typeof ref) => {
                    ref = newRef;
                  },
                  isTemplateDoc: () => false,
                }
              : undefined;
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const firstNoteId = addNote(doc);
    const firstParagraphId = doc.addBlock('affine:paragraph', {}, firstNoteId);
    const firstModel = doc.getModelById(firstParagraphId)!;

    const todoItems = journalTodoDatabaseSlashMenuConfig.items;
    const resolvedTodoItems =
      typeof todoItems === 'function'
        ? todoItems({ std: stub, model: firstModel })
        : todoItems;
    await (
      resolvedTodoItems.find(i => i.name === 'Journal Todo') as unknown as {
        action: () => Promise<void>;
      }
    ).action();
    await wait();
    const tableARef = ref!;
    const refEl = document.querySelector(
      'affine-database-view-ref'
    ) as DatabaseViewRefBlockComponent;
    const insertedRefId = refEl.model.id;
    expect(refEl.model.props.refBlockId).toBe(tableARef.refBlockId);

    // Now switch the source to a brand-new table B.
    const secondNoteId = addNote(doc);
    const secondParagraphId = doc.addBlock(
      'affine:paragraph',
      {},
      secondNoteId
    );
    const secondModel = doc.getModelById(secondParagraphId)!;
    const sourceItems = journalTodoSourceSlashMenuConfig.items;
    const resolvedSourceItems =
      typeof sourceItems === 'function'
        ? sourceItems({ std: stub, model: secondModel })
        : sourceItems;
    const newSourceItem = resolvedSourceItems.find(
      i => i.name === 'New Journal Todo Table'
    ) as unknown as { action: () => void };
    newSourceItem.action();
    await wait();
    const tableBRef = ref!;
    expect(tableBRef.refBlockId).not.toBe(tableARef.refBlockId);

    // The already-inserted reference block still points at table A.
    const stillA = doc.getBlock(insertedRefId)!.model as unknown as {
      props: { refBlockId: string };
    };
    expect(stillA.props.refBlockId).toBe(tableARef.refBlockId);
  });
});
