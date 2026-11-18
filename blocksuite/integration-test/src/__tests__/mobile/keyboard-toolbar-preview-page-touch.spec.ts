import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type { DatabaseRefBlockComponent } from '@blocksuite/affine/blocks/database-ref';
import { insertDatabaseRefBlockCommand } from '@blocksuite/affine/blocks/database-ref';
import type { DatabaseViewRefBlockComponent } from '@blocksuite/affine/blocks/database-view-ref';
import { insertDatabaseViewRefBlockCommand } from '@blocksuite/affine/blocks/database-view-ref';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { FeatureFlagService } from '@blocksuite/affine/shared/services';
import { type Store, Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import {
  registerStubVirtualKeyboardProviderForAllScopes,
  unregisterStubVirtualKeyboardProviderForAllScopes,
} from './utils.js';

// Phase 4 (MOBILE-12, D-06): `KeyboardToolbarViewExtension.setup()` now also
// registers `keyboardToolbarWidget` for the `'preview-page'` view-extension
// scope (this plan's Task 1 fix, `view.ts`) — the scope `database-ref`/
// `database-view-ref` use to render referenced content in their own nested
// `BlockStdScope`. Journal Todo (Phase 2) renders exclusively through
// `database-view-ref`, so this is the real reachability fix: Phase 2 wired
// Journal Todo/Calendar into the toolbar's own tool group, but no toolbar
// *instance* ever mounted inside referenced content until now.
describe('keyboard-toolbar reachability inside "preview-page" referenced content (Phase 4, MOBILE-12)', () => {
  beforeEach(async () => {
    // Registers `VirtualKeyboardProvider` scope-agnostically (covers the
    // outer 'mobile-page' scope AND the nested 'preview-page' scope
    // referenced content mounts its own `BlockStdScope` under) — see this
    // function's own doc comment (`mobile/utils.ts`) for why the plain
    // `createStubVirtualKeyboardExtension()` + `setupEditor(..., [ext])`
    // pattern every other spec in this suite uses isn't enough once
    // referenced content is involved, and why this file uses this instead
    // of also passing `createStubVirtualKeyboardExtension()` here directly
    // (doing both would register the same service twice for the outer
    // scope and throw `DuplicateServiceDefinitionError`). Unregistered again
    // after every test (see the returned teardown below) so no other spec
    // file sharing this process (`isolate: false`) ever observes it.
    registerStubVirtualKeyboardProviderForAllScopes();
    const cleanup = await setupEditor('page');
    // `AffineKeyboardToolbarWidget.render()` gates on this flag (default
    // `false`, `keyboard-toolbar-position-touch.spec.ts` establishes this
    // same opt-in pattern); enable it so the widget can actually mount
    // `affine-keyboard-toolbar` in the DOM for these tests.
    doc.get(FeatureFlagService).setFlag('enable_mobile_keyboard_toolbar', true);
    return async () => {
      await cleanup();
      unregisterStubVirtualKeyboardProviderForAllScopes();
    };
  });

  // A database List-view row is the same real, focusable, tabindex-carrying
  // element `keyboard-toolbar-indent-touch.spec.ts`'s own `focusRow` helper
  // uses — genuinely dispatches a `focusin` that bubbles through whichever
  // `BlockStdScope`'s host it's actually nested under, exactly the mechanism
  // this fix depends on (`UIEventDispatcher`'s `focusin` binding,
  // `dispatcher.ts`).
  function seedCanonicalDatabaseWithListRow() {
    const noteId = addNote(doc);
    const canonicalDbId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );
    const canonicalModel = doc.getModelById(
      canonicalDbId
    ) as DatabaseBlockModel;
    const dataSource = new DatabaseBlockDataSource(canonicalModel);
    const rowId = dataSource.rowAddAsTodoList('end');
    // A fresh `affine:database` has no views at all (`views: []` is the
    // schema default) — without seeding + selecting a List view here, the
    // nested `affine-database` has nothing to render and the row never
    // reaches the DOM.
    const listViewId = dataSource.viewManager.viewAdd('list');
    doc.updateBlock(canonicalModel, { currentViewId: listViewId });
    return { noteId, canonicalDbId, canonicalModel, rowId };
  }

  // Mirrors `waitForNestedDatabase`'s own reasoning: the row is rendered by
  // the nested `affine-database`'s own list-view renderer, one further Lit
  // update cycle after the `affine-database` element itself first mounts —
  // so polling for the row directly (rather than assuming one `wait()` is
  // enough once `affine-database` exists) avoids the identical race.
  async function focusListRow(container: Element, rowId: string) {
    let rowEl: HTMLElement | null = null;
    for (let attempt = 0; attempt < 20; attempt++) {
      rowEl = container.querySelector(
        `.affine-data-view-list-row[data-row-id="${rowId}"]`
      ) as HTMLElement | null;
      if (rowEl) break;
      await wait();
    }
    if (!rowEl) {
      throw new Error(
        'DEBUG focusListRow rowId=' +
          rowId +
          ' container.isConnected=' +
          container.isConnected +
          ' container.outerHTML=' +
          (container as HTMLElement).outerHTML.slice(0, 2000)
      );
    }
    expect(rowEl).toBeTruthy();
    rowEl!.focus();
  }

  // The nested `<editor-host>` this wrapper renders is inserted
  // synchronously, but it renders its *own* content (down to the nested
  // `affine-database`) on its own, later Lit update cycle
  // (`database-ref-block.ts`'s own `_observeForRangeQueryExclusion` comment
  // documents this exact race for the identical reason) — so a single
  // `await wait()` right after the insert command isn't reliably enough for
  // `affine-database` to already exist. Poll for it instead of assuming a
  // fixed number of `wait()` cycles is always enough.
  async function waitForNestedDatabase(container: Element) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const nestedDatabase = container.querySelector('affine-database') as
        | (HTMLElement & {
            store: Store;
            std: { event: { active: boolean } };
          })
        | null;
      if (nestedDatabase) return nestedDatabase;
      await wait();
    }
    return null;
  }

  // `FeatureFlagService` is a `StoreExtension` — a plain in-memory signal
  // scoped to one `Store` *instance*, not shared across every `Store` built
  // over the same underlying `Doc` (`feature-flag-service.ts`). The nested
  // preview's own `_previewStore` (`refDoc.getStore({ query })`) is a
  // completely separate `Store` instance from the outer page's `doc`, with
  // its own fresh `FeatureFlagService` defaulting `enable_mobile_keyboard_
  // toolbar` back to `false` — so `doc.get(FeatureFlagService).setFlag(...)`
  // in `beforeEach` has no effect on it. The flag must be set on the nested
  // store directly, resolved here via the mounted `affine-database`
  // element's own `.store` accessor (`BlockComponent`'s public `store`
  // field resolves to whichever `Store` actually rendered it).
  async function enableToolbarOnNestedPreview(container: Element) {
    const nestedDatabase = await waitForNestedDatabase(container);
    expect(nestedDatabase).toBeTruthy();
    nestedDatabase!.store
      .get(FeatureFlagService)
      .setFlag('enable_mobile_keyboard_toolbar', true);
  }

  // Task 1: proves the toolbar actually mounts inside `database-ref`'s own
  // nested preview (the block whose `_previewSpec` this plan's registration
  // change reaches automatically, with zero changes to
  // `database-ref-block.ts` itself), and that only one instance is ever
  // visible — matching D-06's claim that `_stopDispatcherActivationBubbling`
  // guarantees the outer page's own dispatcher never activates while focus
  // is inside the nested scope, so the outer toolbar (if any) never shows
  // simultaneously.
  test('mounts inside a database-ref preview when focus lands inside referenced content, and exactly one instance is visible at a time', async () => {
    const { canonicalDbId, rowId } = seedCanonicalDatabaseWithListRow();
    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;

    const [, result] = editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: canonicalDbId,
      place: 'after',
      selectedModels: [anchorModel],
    });
    expect(result.insertedDatabaseRefBlockId).toBeTruthy();
    await wait();

    const refEl = document.querySelector(
      `affine-database-ref[data-block-id="${result.insertedDatabaseRefBlockId}"]`
    ) as DatabaseRefBlockComponent;
    expect(refEl).toBeTruthy();

    // Before any focus lands inside the reference, no toolbar exists
    // anywhere in the document.
    expect(document.querySelectorAll('affine-keyboard-toolbar').length).toBe(0);

    // `database-ref-block.ts`'s own `_subscribeTargetDoc` debounces every
    // Yjs `update` on the (same-doc) target by 300ms before re-running
    // `_maybeRefreshPreview` — and every seed/insert step above (note,
    // database, row, view, the ref block itself) is one such update. Wait
    // past that debounce window before grabbing handles to nested elements,
    // so a same-tick `guard()` reconstruction of the nested `BlockStdScope`
    // doesn't invalidate a handle captured just before it fired.
    await wait(400);

    await enableToolbarOnNestedPreview(refEl);
    await focusListRow(refEl, rowId);
    await wait();
    await wait();

    expect(document.querySelectorAll('affine-keyboard-toolbar').length).toBe(1);
    // `<blocksuite-portal>` (`widget.ts`'s `render()`) always portals its
    // template onto `document.body`, never as a light-DOM descendant of
    // whichever `BlockComponent` hosts the widget instance — so DOM
    // containment under `refEl` can never be the proof here. What proves
    // the instance actually came from the nested 'preview-page' scope
    // (rather than a same-named instance the OUTER scope also rendered) is
    // identity of the `std` the rendered `<affine-keyboard-toolbar>` was
    // built against: `AffineKeyboardToolbar.std` (`keyboard-toolbar.ts`)
    // resolves to `this.rootComponent.std`, and `rootComponent` is set from
    // `this.block.rootComponent` on whichever `AffineKeyboardToolbarWidget`
    // instance actually rendered (`widget.ts`'s `render()`) — so comparing
    // it against the nested `affine-database`'s own `.std` (the same
    // `BlockStdScope` `enableToolbarOnNestedPreview` above already reads
    // `.store` from) directly proves must_have #2 (resolves against the
    // referenced content's own nested store/std, not the outer page's).
    const nestedDatabase = await waitForNestedDatabase(refEl);
    expect(nestedDatabase).toBeTruthy();
    const toolbarEl = document.querySelector('affine-keyboard-toolbar') as
      | (HTMLElement & { rootComponent?: { std?: unknown } })
      | null;
    expect(toolbarEl).toBeTruthy();
    expect(toolbarEl!.rootComponent?.std).toBe(nestedDatabase!.std);

    // `UIEventDispatcher._activeDispatcher` (`dispatcher.ts`) is a SHARED
    // STATIC field across every `BlockStdScope` in the process, not
    // per-editor state that `setupEditor`'s per-test `cleanup()` resets —
    // removing this test's editor from the DOM does not reliably fire a
    // real `blur`/`focusout` on the nested host (we focused a descendant
    // row, not the host itself, and `blur`/`focusout` don't bubble the same
    // way `focusin` does), so the nested dispatcher this test just made
    // active can otherwise stay the process-wide "active dispatcher"
    // indefinitely, with its own `_active` signal frozen at `true` after
    // this test's own JS objects are torn down. A later, unrelated test
    // sharing this same process (`vitest.mobile.config.ts`'s
    // `isolate: false`) can then observe a stray `affine-keyboard-toolbar`
    // it never asked for. Explicitly deactivating here (mirroring
    // `note-ref-block.ts`'s own symmetric `std.event.active = true`/`= false`
    // pattern) keeps this test's own global side effects contained to
    // itself.
    nestedDatabase!.std.event.active = false;
    await wait();
  });

  // Task 1 (continued): the same proof for `database-view-ref` — this is
  // the actual Journal Todo rendering path (`insertJournalTodoReference`
  // inserts an `affine:database-view-ref`, never a plain `database-ref`),
  // so this is the test that most directly matches the phase's own root-
  // cause finding ("Journal Todo is unreachable in practice despite Phase
  // 2's registration").
  test('mounts inside a database-view-ref preview (the Journal Todo rendering path) when focus lands inside referenced content', async () => {
    const { canonicalDbId, rowId } = seedCanonicalDatabaseWithListRow();
    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;

    const [, result] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      {
        refBlockId: canonicalDbId,
        place: 'after',
        selectedModels: [anchorModel],
        // Seeds this reference's own local List view (`views` defaults to
        // `[]` on a bare `affine:database-view-ref`), mirroring how
        // `insertJournalTodoReference` seeds a fresh Journal Todo
        // reference.
        initialView: { viewType: 'list' },
      }
    );
    expect(result.insertedDatabaseViewRefBlockId).toBeTruthy();
    await wait();

    const refEl = document.querySelector(
      `affine-database-view-ref[data-block-id="${result.insertedDatabaseViewRefBlockId}"]`
    ) as DatabaseViewRefBlockComponent;
    expect(refEl).toBeTruthy();

    // See the identical `wait(400)` comment in the `database-ref` test
    // above — same 300ms debounced target-doc refresh hazard, same fix.
    await wait(400);

    await enableToolbarOnNestedPreview(refEl);
    await focusListRow(refEl, rowId);
    await wait();
    await wait();

    expect(document.querySelectorAll('affine-keyboard-toolbar').length).toBe(1);
    // See the identical `<blocksuite-portal>` containment note in the
    // `database-ref` test above — DOM containment under `refEl` can never
    // be the proof, so this compares the rendered toolbar's own
    // `rootComponent.std` against the nested `affine-database`'s `.std`
    // instead, proving must_have #2 for the actual Journal Todo rendering
    // path.
    const nestedDatabase = await waitForNestedDatabase(refEl);
    expect(nestedDatabase).toBeTruthy();
    const toolbarEl = document.querySelector('affine-keyboard-toolbar') as
      | (HTMLElement & { rootComponent?: { std?: unknown } })
      | null;
    expect(toolbarEl).toBeTruthy();
    expect(toolbarEl!.rootComponent?.std).toBe(nestedDatabase!.std);

    // See the identical `UIEventDispatcher._activeDispatcher` static-leak
    // note in the `database-ref` test above — same cross-test cleanup, same
    // fix.
    nestedDatabase!.std.event.active = false;
    await wait();
  });

  // Task 2: regression coverage for the other 'preview-page' consumers this
  // plan's scope-wide registration also now reaches. `embed-synced-doc-
  // block.ts`'s `syncedDoc` getter opens its preview `Store` with
  // `{ readonly: true }` (embed-synced-doc-block.ts:414) — this constructs
  // a real `affine:embed-synced-doc` block (its inline content renders
  // unconditionally in page mode once its target doc is loaded and not a
  // card-only nested embed, `_renderSyncedView`/`renderBlock`, no manual
  // "expand" step needed) and proves both that the resolved preview `Store`
  // really is readonly, and that `AffineKeyboardToolbarWidget.render()`'s
  // existing `this.store.readonly` gate (widget.ts:98-105) keeps the
  // toolbar out even though this plan's registration now reaches this scope
  // too.
  test("does not render inside embed-synced-doc-block's nested preview — its preview Store stays readonly (embed-synced-doc-block.ts:414)", async () => {
    const secondDoc = collection
      .createDoc(`doc:second-${Math.random().toString(16).slice(2, 8)}`)
      .getStore();
    secondDoc.load(() => {
      const rootId = secondDoc.addBlock('affine:page', { title: new Text() });
      secondDoc.addBlock('affine:surface', {}, rootId);
      const secondNoteId = secondDoc.addBlock('affine:note', {}, rootId);
      secondDoc.addBlock('affine:paragraph', {}, secondNoteId);
    });
    secondDoc.resetHistory();

    const noteId = addNote(doc);
    const embedId = doc.addBlock(
      'affine:embed-synced-doc',
      { pageId: secondDoc.id },
      noteId
    );
    await wait();
    await wait();

    const embedEl = document.querySelector(
      `affine-embed-synced-doc-block[data-block-id="${embedId}"]`
    ) as HTMLElement & { syncedDoc: Store | null };
    expect(embedEl).toBeTruthy();
    expect(embedEl.syncedDoc?.readonly).toBe(true);
    const syncedDocStore = embedEl.syncedDoc;

    // Attempting to focus into whatever nested content did mount must not
    // surface a keyboard-toolbar — the readonly gate should suppress it
    // regardless of this plan's scope-wide registration.
    const focusable = embedEl.querySelector(
      '[contenteditable], [tabindex]'
    ) as HTMLElement | null;
    focusable?.focus();
    await wait();

    // Deliberately NOT a document-wide "zero toolbars anywhere" check: the
    // OUTER page's own 'mobile-page'/'page'+IS_MOBILE toolbar registration
    // (pre-existing, unrelated to this plan) can independently activate
    // from ordinary block-insertion/selection mechanics elsewhere on the
    // page — that's expected, correct behavior for the OUTER, non-readonly
    // page and orthogonal to what this test is actually verifying. What
    // must_have #3 / T-04-01-01 actually requires is that the READONLY
    // GATE holds for THIS embed's own nested preview specifically, so this
    // asserts no rendered toolbar's `rootComponent` resolves back to the
    // embed's own (confirmed readonly) `syncedDoc` store — the precise,
    // scope-targeted equivalent of "does not render inside this preview".
    const toolbarsAgainstSyncedDoc = Array.from(
      document.querySelectorAll('affine-keyboard-toolbar')
    ).filter(
      tb =>
        (tb as unknown as { rootComponent?: { store?: Store } }).rootComponent
          ?.store === syncedDocStore
    );
    expect(toolbarsAgainstSyncedDoc.length).toBe(0);
  });

  // `surface-ref/src/portal/note.ts`'s own preview construction
  // (`renderPreview()`, line ~121-124) also opens its preview `Store` with
  // `{ readonly: true }` — confirmed by direct source read at
  // implementation time (`grep -n "readonly: true"
  // blocksuite/affine/blocks/surface-ref/src/portal/note.ts` matches).
  // `SurfaceRefNotePortal` isn't part of this package's public exports
  // (only `commands.js`/`surface-ref-block.js`/`surface-ref-block-
  // edgeless.js` are re-exported from `index.ts`), and it only ever mounts
  // inside a real edgeless surface's own Frame rendering — genuinely
  // non-trivial to construct live in this page-mode-focused spec file
  // (would need a full edgeless canvas + GFX Frame element), so per this
  // task's own documented fallback this is a source-level confirmation
  // rather than a live DOM/import-based runtime assertion. The render-level
  // gate itself (`this.store.readonly` in widget.ts) is already proven
  // generically by the embed-synced-doc-block test above and the two
  // database-ref/database-view-ref tests' own passing state — this note
  // documents that the *other* known readonly call site is unmodified by
  // this plan, not a duplicate proof of the gate mechanism.

  // `drag-handle/src/helpers/preview-helper.ts`'s `getPreviewStd` opens its
  // preview `Store` via `widget.store.doc.getStore({ query })` — no
  // explicit `readonly` flag, genuinely non-readonly. This preview is a
  // transient, non-block-registered visual drag-ghost thumbnail: it's never
  // attached to the document long enough to receive a real `focusin` (it
  // exists only for the duration of an active drag gesture), and isn't part
  // of the interactive DOM tree the way a mounted block reference is. This
  // suite has no synthetic-drag-gesture harness to exercise it live, so
  // this is flagged here for confirmation during this phase's live/touch-
  // emulated on-device verification pass rather than blocked on building
  // one.
});
