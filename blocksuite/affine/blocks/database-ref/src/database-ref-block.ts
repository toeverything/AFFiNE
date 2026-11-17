import { toast } from '@blocksuite/affine-components/toast';
import { ViewExtensionManagerIdentifier } from '@blocksuite/affine-ext-loader';
import type { DatabaseRefBlockModel } from '@blocksuite/affine-model';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import { BlockComponent, BlockStdScope } from '@blocksuite/std';
import { RANGE_QUERY_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import type { BlockModel, Query, Store } from '@blocksuite/store';
import { autoUpdate } from '@floating-ui/dom';
import { css, html, nothing } from 'lit';
import { guard } from 'lit/directives/guard.js';

import { DatabaseRefPreviewRootOverride } from './preview-root';

// `refDoc.getStore({ query })` caches by a JSON-serialized key of the query
// itself (`StoreContainer._getQueryKey`), and every `database-ref` pointing
// at the *same* canonical table builds the exact same query (it only
// depends on the canonical block's own ancestor chain, not on which
// reference asked for it) — so all such references end up sharing one
// underlying preview `Store` instance, not one each. That means a
// `deleteBlock` override can't be tied to "this ref's own preview store"
// (there's no such thing once a table has more than one reference); the
// only place that still uniquely identifies "which reference the user was
// just interacting with" is the DOM, tracked here via plain pointerdown
// bubbling (reliable even when the actual delete action opens in a
// separately-portaled menu afterward, since the initial press that opens it
// still bubbles through this wrapper first).
const lastActiveRefIdByCanonical = new Map<string, string>();
const patchedPreviewStores = new WeakSet<object>();

// Evicted by `delete-guard.ts` once a canonical table is actually deleted
// (its last reference removed) — otherwise this map grows for the entire
// app session, one entry per canonical block id that ever had pointer
// interaction, never freed even after the block/doc is long gone.
export function forgetLastActiveRef(canonicalId: string) {
  lastActiveRefIdByCanonical.delete(canonicalId);
}

/**
 * Every `Store` (including a query-filtered preview one) builds its own
 * fully independent reactive object graph — its own model instances, its
 * own per-property signals — for every block it can see
 * (`Block`/`SyncController`, `framework/store/src/model/block/*.ts`), even
 * when another `Store` already has its own independent graph for those
 * *same* underlying Yjs blocks. `Store.dispose()` exists specifically to
 * tear this down (`store.ts:1242`, unobserves the doc). We never called it:
 * when `_maybeRefreshPreview` below replaces `_previewStore` with a new one
 * (the ancestor chain changed), the old one — and its entire graph of
 * per-block Yjs observers — was simply abandoned, left running forever,
 * continuing to react to every future change to those blocks even though
 * nothing renders through it anymore. Left unbounded, this accumulates
 * extra live reactive graphs racing the *current* one against the same
 * underlying data — exactly the shape of thing that can trip signals'
 * own re-entrancy guard ("Cycle detected") under rapid successive writes
 * (e.g. dragging Kanban cards) — worst right after a reload, when a burst
 * of incoming Yjs updates as the whole doc syncs in is most likely to
 * shift the ancestor chain (rebuilding the store) more than once in quick
 * succession, across several references at once.
 *
 * Since every reference to the same canonical table shares one
 * `_previewStore` instance (see the module comment below), we can't just
 * dispose it when any single reference stops using it — this reference-
 * counts instead, keyed by object identity, and only disposes (and evicts
 * the doc's own `getStore({query})` cache entry, so a future reference
 * doesn't get handed back an already-disposed store) once nothing is
 * using it anymore.
 */
const previewStoreRefCounts = new Map<Store, number>();

function retainPreviewStore(store: Store) {
  previewStoreRefCounts.set(store, (previewStoreRefCounts.get(store) ?? 0) + 1);
}

function releasePreviewStore(
  store: Store | null,
  refDoc: Store['doc'] | null,
  query: Query | null
) {
  if (!store) return;
  const count = (previewStoreRefCounts.get(store) ?? 1) - 1;
  if (count > 0) {
    previewStoreRefCounts.set(store, count);
    return;
  }
  previewStoreRefCounts.delete(store);
  store.dispose();
  if (refDoc && query) {
    try {
      refDoc.removeStore({ query });
    } catch {
      // The doc may already be disposed (e.g. workspace switched away
      // entirely) by the time this cleanup runs — nothing left to evict.
    }
  }
}

/**
 * Renders a live view of a single `affine:database` block, addressed by
 * `refBlockId` + `refDocId` (defaults to the current doc when unset,
 * preserving Story 0.2's same-page-only behavior exactly; a real foreign
 * doc id, populated by Story 0.3's cross-doc picker, resolves against that
 * doc's own `Store` instead — see `_getUnfilteredTargetStore` below).
 *
 * Unlike `affine:surface-ref` (which crops an edgeless viewport around a
 * Gfx element's `xywh` bound), a database block is flow content with no
 * `xywh` — so this mounts a nested `BlockStdScope` over a *filtered* view of
 * the doc (via `Query`, `mode: 'include'`) that displays only the database
 * block's own ancestor chain plus its descendant rows.
 *
 * The filtered `Store` is *not* opened read-only: `DatabaseBlockDataSource`
 * (constructed internally by the registered `affine-database` component
 * when it renders inside this nested scope) reads/writes via
 * `this._model.store`, which — because BlockSuite `Store`s over the same
 * `Doc` share live Yjs data — resolves to the *actual* target store. Row
 * add/edit/delete performed inside this rendered view lands on the real
 * source rows, and every other reference to the same `refBlockId` sees it
 * live too.
 *
 * VIEW SPEC — went through two wrong turns before landing here, both found
 * only through hands-on testing, not automated tests:
 *  1. Tried 'preview-page' first: its root (`PreviewRootBlockComponent`)
 *     hardcodes an exclusion for any note whose `displayMode` is
 *     `EdgelessOnly` — exactly the mode the hidden host note this relies on
 *     uses (see `commands.ts`), so it never rendered at all.
 *  2. Switched to 'preview-edgeless' to dodge that filter (its root has
 *     none) — but that root sets `pointer-events: none` and pairs with
 *     `EdgelessLocker` (`viewport.locked = true`): correct for a genuine
 *     read-only preview, but it made the rendered table uneditable and its
 *     own menus unclickable, and its `height: 100%` styling collapsed to
 *     zero outside a real full-height viewport container.
 *  3. Landed here: still 'preview-page' (fully interactive, sizes to
 *     content naturally, no viewport/height fuss), but with its `affine:page`
 *     view registration overridden (`DatabaseRefPreviewRootOverride`,
 *     appended after the rest of 'preview-page's extensions so it wins) to a
 *     near-identical root with just the `EdgelessOnly` exclusion removed.
 *
 * PERFORMANCE (learned the hard way in an earlier pass at this): `BlockStdScope`'s
 * constructor is expensive — it wires up 13+ internal subsystems
 * (CommandManager, GfxController, ViewManager, etc.) plus the entire
 * `preview-page` view spec, roughly the cost of mounting a whole editor.
 * Two things are required to avoid rebuilding it on every keystroke:
 *  1. `guard(this._previewStore, ...)` in `render()`, so a `BlockStdScope`
 *     is only (re)constructed when `_previewStore`'s reference changes.
 *  2. `_previewStore` itself must not get a new reference on every doc
 *     update — `_maybeRefreshPreview` below only replaces it when the
 *     referenced block's ancestor chain (the only thing the `Query` actually
 *     depends on) has structurally changed, not on routine content edits.
 * Without both together, `guard()` alone doesn't help, since it would still
 * see a "changed" dependency on every update.
 */
export class DatabaseRefBlockComponent extends BlockComponent<DatabaseRefBlockModel> {
  // Deliberately no border/background/decoration: a referenced Table should
  // look no different from a native `affine:database` block — the fact that
  // it's a reference is an implementation detail. The nested
  // `affine-database` component (rendered via `BlockStdScope` below)
  // already carries its own normal styling.
  static override styles = css`
    affine-database-ref {
      display: block;
    }
  `;

  private _previewStore: Store | null = null;

  private _previewRefDoc: Store['doc'] | null = null;

  private _previewQuery: Query | null = null;

  private _resolveError: string | null = null;

  private _ancestorChain: string[] = [];

  private _targetDocUnsubscribe: (() => void) | null = null;

  private _refreshDebounce: ReturnType<typeof setTimeout> | null = null;

  private _rangeExcludeObserver: MutationObserver | null = null;

  private _fullWidthBleedCleanup: (() => void) | null = null;

  private get _previewSpec() {
    return [
      ...this.std.get(ViewExtensionManagerIdentifier).get('preview-page'),
      DatabaseRefPreviewRootOverride,
    ];
  }

  private get _targetDocId(): string {
    return this.model.props.refDocId || this.std.store.id;
  }

  private _collectSubtreeIds(model: BlockModel, ids: Set<string>) {
    ids.add(model.id);
    for (const child of model.children) {
      this._collectSubtreeIds(child, ids);
    }
  }

  private _getAncestorChain(store: Store, model: BlockModel): string[] {
    const chain: string[] = [];
    let ancestor = store.getParent(model);
    while (ancestor) {
      chain.push(ancestor.id);
      ancestor = store.getParent(ancestor);
    }
    return chain;
  }

  private _sameChain(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id, i) => id === b[i]);
  }

  /**
   * Resolves an *unfiltered* `Store` for `refDoc`, for ancestor-chain
   * lookups and the raw-Yjs-update subscription — not for rendering.
   *
   * Previously this called `refDoc.getStore({ id: refDoc.id })`, reasoning
   * that a stable `id` avoids `StoreContainer.getStore`'s "no id/query
   * given → mint a fresh random cache key" fallback (a real churn problem
   * on its own, fixed by this). But that stable id has no guarantee of
   * matching whatever key the *outer* editor's own main store happens to
   * be cached under — the outer editor may itself have been built via a
   * plain `getStore()` call (a random key), as this repo's own test
   * harness does. So that "fix" was actually minting a SECOND, permanent,
   * fully-unfiltered `Store` for the entire document, parallel to the
   * outer editor's own one — meaning every block in the whole doc, not
   * just the referenced table, now had two independent reactive model
   * wrappers reacting to the same underlying Yjs mutations. That's a
   * worse and more persistent version of the churn bug, and it's what
   * surfaced as a "Cycle detected" Yjs/preact-signals error on a cold
   * reload with several references and views live at once (a burst of
   * near-simultaneous Yjs updates as the whole doc syncs in, hitting both
   * wrapper sets together).
   *
   * The actual fix: for the same-doc case (`refDocId` unset, defaulting to
   * the current doc), the correct "unfiltered store for this doc" already
   * exists and is exactly `this.std.store` — the same instance the rest of
   * the page is using, so reuse it rather than minting a second one. A
   * genuinely different doc (cross-doc referencing, Story 0.3) has no such
   * existing instance to reuse and needs its own stable-id lookup, which is
   * exactly what the `else` branch below does.
   */
  private _getUnfilteredTargetStore(refDoc: Store['doc']): Store {
    if (refDoc === this.std.store.doc) {
      return this.std.store;
    }
    return refDoc.getStore({ id: refDoc.id });
  }

  /**
   * Resolves the target and rebuilds `_previewStore` — but only actually
   * replaces it (a new `Query`/`Store`/eventually new `BlockStdScope`) when
   * the ancestor chain changed since last time. Cheap to call frequently;
   * expensive only on the rare structural change (reparenting).
   */
  private _maybeRefreshPreview() {
    const { refBlockId } = this.model.props;
    if (!refBlockId) {
      this._resolveError = 'This reference is missing its target.';
      this._replacePreviewStore(null, null, null);
      return;
    }

    const refDoc = this.std.workspace.getDoc(this._targetDocId);
    if (!refDoc) {
      this._resolveError = 'The referenced page could not be found.';
      this._replacePreviewStore(null, null, null);
      return;
    }
    // Cross-doc: the target doc's content streams in asynchronously from
    // local storage (or a remote peer) — `load()` kicks that off. Without
    // this, a doc the user hasn't opened this session never starts loading
    // at all, so `_subscribeTargetDoc`'s `update` listener below would have
    // nothing to ever fire on.
    if (!refDoc.ready) {
      refDoc.load();
      // `load()` here is fire-and-forget — the doc isn't actually loaded
      // yet, so reading its content immediately below would see an
      // empty/partial tree indistinguishable from "this reference is
      // broken," flashing a resolve error (or constructing a preview over
      // incomplete data) instead of just waiting. Bail out entirely; the
      // `update` listener re-invokes this once real content has actually
      // arrived and `ready` reflects that (mirrors the identical fix in
      // `note-ref-block.ts`'s own `_maybeRefreshPreview`/
      // `_ensureTrailingParagraph`, same underlying hazard).
      return;
    }

    const targetStore = this._getUnfilteredTargetStore(refDoc);
    const targetModel = targetStore.getBlock(refBlockId)?.model;
    if (!targetModel || targetModel.flavour !== 'affine:database') {
      this._resolveError = 'The referenced table could not be found.';
      this._replacePreviewStore(null, null, null);
      return;
    }

    const ancestorChain = this._getAncestorChain(targetStore, targetModel);

    if (
      this._previewStore &&
      !this._resolveError &&
      this._sameChain(ancestorChain, this._ancestorChain)
    ) {
      // Nothing structurally relevant changed — keep the existing
      // `_previewStore` reference so `guard()` in `render()` skips
      // reconstructing the (expensive) nested `BlockStdScope`.
      return;
    }

    this._ancestorChain = ancestorChain;

    const displayIds = new Set<string>(ancestorChain);
    this._collectSubtreeIds(targetModel, displayIds);

    const query: Query = {
      mode: 'include',
      match: Array.from(displayIds).map(id => ({
        id,
        viewType: 'display',
      })),
    };

    const nextPreviewStore = refDoc.getStore({ query });
    // `getStore({ query })` only *constructs* the Store — every
    // `StoreExtension`'s own `loaded()` lifecycle hook (which attaches
    // its real event listeners and computes its initial state) doesn't
    // run until `Store.load()` is explicitly called, a step separate
    // from `Doc.load()`. Without it, `HistoryExtension`'s own `_canUndo`/
    // `_canRedo` signals (what `Store.canUndo`/`.canRedo` actually read)
    // stay frozen at their construction-time default (`false`) forever,
    // regardless of how many real, undo-stack-worthy edits happen
    // afterward — confirmed live as a real bug for `note-ref-block.ts`'s
    // identical pattern (see that file's own `_maybeRefreshPreview`),
    // fixed there with this same one-line change.
    nextPreviewStore.load();
    this._installDeleteRedirect(nextPreviewStore, targetModel.id);
    this._replacePreviewStore(nextPreviewStore, refDoc, query);
    this._resolveError = null;
  }

  /**
   * The only place `_previewStore` is ever assigned — retains the new
   * store (if any) and releases whatever this component was using before,
   * so a store nothing renders through anymore actually gets torn down
   * (see the module-level ref-counting comment above `previewStoreRefCounts`).
   */
  private _replacePreviewStore(
    store: Store | null,
    refDoc: Store['doc'] | null,
    query: Query | null
  ) {
    if (store === this._previewStore) return;
    if (store) retainPreviewStore(store);
    releasePreviewStore(
      this._previewStore,
      this._previewRefDoc,
      this._previewQuery
    );
    this._previewStore = store;
    this._previewRefDoc = refDoc;
    this._previewQuery = query;
  }

  /**
   * The database's own "..." more-menu has a "Delete Database" action
   * (`database-block.ts`) that does *two* things, both on the real
   * canonical model since this package renders it live rather than a
   * read-only snapshot (unlike `surface-ref`'s frame preview):
   *
   *   this.model.children.forEach(b => this.store.deleteBlock(b));
   *   this.store.deleteBlock(this.model);
   *
   * Redirecting only the second call (as an earlier version of this fix
   * did) missed the first: it unconditionally deletes every row *before*
   * the self-delete we redirect ever runs, so real, still-referenced-
   * elsewhere data was wiped regardless — this went unnoticed until tested
   * against a table that actually had rows. But an individual row must
   * still be deletable normally (through the table's own per-row UI) even
   * while multiple references exist, since that's a legitimate shared
   * edit, not a "delete the whole table" request — and nothing at the
   * `deleteBlock` layer distinguishes the two calls in isolation.
   *
   * What *does* distinguish them: both calls in the more-menu action run
   * synchronously, back to back, with no `await` between them. So a
   * deletion of one of the canonical's own children is buffered rather
   * than applied immediately, and only actually committed on a microtask
   * flush — by which time a same-tick self-delete (if any) has already
   * been observed and marks the buffered children as moot: the whole
   * table's fate (redirect one view, or — if it's the last one — a real
   * cascade covering its children anyway) decides theirs instead. An
   * isolated row deletion (no self-delete follows) sees no such marker by
   * flush time and goes through for real.
   *
   * Installed once per shared preview `Store` (see the module comment
   * above on why it's shared, not per-reference).
   */
  private _installDeleteRedirect(previewStore: Store, canonicalId: string) {
    if (patchedPreviewStores.has(previewStore)) return;
    patchedPreviewStores.add(previewStore);

    const outerStore = this.std.store;
    const outerHost = this.std.host;
    const original = previewStore.deleteBlock.bind(previewStore);

    let pendingChildren: BlockModel[] = [];
    let flushScheduled = false;
    let selfDeleteSeen = false;

    const flushPendingChildren = () => {
      flushScheduled = false;
      const children = pendingChildren;
      pendingChildren = [];
      if (selfDeleteSeen) {
        selfDeleteSeen = false;
        return;
      }
      children.forEach(child => original(child, undefined));
    };

    previewStore.deleteBlock = (model, options) => {
      const id = typeof model === 'string' ? model : model.id;

      if (id === canonicalId) {
        selfDeleteSeen = true;
        const currentRefId = lastActiveRefIdByCanonical.get(canonicalId);
        const currentRefModel = currentRefId
          ? outerStore.getBlock(currentRefId)?.model
          : undefined;
        if (currentRefModel) {
          outerStore.deleteBlock(currentRefModel);
        } else {
          console.warn(
            '[database-ref] refusing to delete a multiply-referenced table: could not determine which reference view initiated the request'
          );
          toast(
            outerHost,
            'Could not determine which reference to delete — try again from this view.'
          );
        }
        return;
      }

      const resolvedModel =
        typeof model === 'string' ? previewStore.getBlock(model)?.model : model;
      const parent = resolvedModel && previewStore.getParent(resolvedModel);
      if (resolvedModel && parent?.id === canonicalId) {
        pendingChildren.push(resolvedModel);
        if (!flushScheduled) {
          flushScheduled = true;
          queueMicrotask(flushPendingChildren);
        }
        return;
      }

      original(model, options);
    };
  }

  // Marks `node` itself (if it's a block element) plus every block element
  // under it — used for nodes discovered *after* the fact (freshly added by
  // the nested scope's own reactivity), which are always genuine descendants
  // of this wrapper, never the wrapper itself.
  private _excludeSubtreeFromOuterRangeQueries(node: Element) {
    // `node` comes from a MutationObserver's addedNodes (narrowed only to
    // `instanceof Element`, not `HTMLElement`) — `.dataset` isn't available
    // on the base `Element` type, so this stays on the always-safe
    // attribute API rather than the `dataset` the lint rule prefers.
    // oxlint-disable-next-line unicorn/prefer-dom-node-dataset
    if (node.hasAttribute('data-block-id')) {
      node.setAttribute(RANGE_QUERY_EXCLUDE_ATTR, 'true');
    }
    node
      .querySelectorAll('[data-block-id]')
      .forEach(el => el.setAttribute(RANGE_QUERY_EXCLUDE_ATTR, 'true'));
  }

  /**
   * The nested preview renders the real `affine-database` component (and
   * its real row elements) as ordinary light-DOM content with the same
   * `data-block-id` attributes as any first-class page content — so a
   * text-range selection that merely sweeps *across* this reference (e.g.
   * "select from the paragraph above to the paragraph below, then delete")
   * would otherwise have its blocks-in-range resolved by
   * `getSelectedBlockComponentsByRange`'s plain
   * `querySelectorAll('[data-block-id]')` walk, which can't tell "this is
   * a nested reference" from "this is ordinary page content" and ends up
   * deleting the real canonical rows directly, one by one. `surface-ref`
   * hits the identical hazard for the same structural reason and heads it
   * off with the exact same attribute (`portal/note.ts`); this only marks
   * *descendants*, never this wrapper's own element, so a range-selection
   * delete still correctly removes just this reference (see
   * `delete-guard.ts`).
   */
  private _observeForRangeQueryExclusion() {
    this._rangeExcludeObserver?.disconnect();
    // This wrapper's own `data-block-id` (its outer `database-ref` model)
    // must stay unmarked — a range-selection delete should still resolve
    // and remove *it* normally; only its rendered contents are excluded.
    this.querySelectorAll('[data-block-id]').forEach(el =>
      el.setAttribute(RANGE_QUERY_EXCLUDE_ATTR, 'true')
    );
    this._rangeExcludeObserver = new MutationObserver(mutations => {
      let sawAddedNode = false;
      for (const mutation of mutations) {
        mutation.addedNodes.forEach(node => {
          if (node instanceof Element) {
            sawAddedNode = true;
            this._excludeSubtreeFromOuterRangeQueries(node);
          }
        });
      }
      // The nested `<editor-host>` is inserted synchronously as part of
      // this wrapper's own render, but it renders its *own* content (down
      // to the nested `affine-database`) on its own, later Lit update
      // cycle — so `updated()` (which only fires once, right after this
      // wrapper's own render/connect settle, since nothing else on this
      // wrapper's own reactive state changes afterward) can run *before*
      // that child content exists yet, find nothing via
      // `this.querySelector('affine-database')`, and never get a second
      // chance. This observer already fires exactly when that child
      // content actually lands in the DOM (that's what it exists for), so
      // piggyback on it as the reliable trigger for both syncs, rather
      // than depending solely on `updated()`'s single opportunistic pass
      // (confirmed live: `_syncCurrentView` reported "no nested database
      // found" on every single `updated()` call, forever, once the child
      // failed to be ready on the first attempt).
      if (sawAddedNode) {
        this._syncFullWidthBleed();
        this._syncCurrentView();
      }
    });
    this._rangeExcludeObserver.observe(this, {
      childList: true,
      subtree: true,
    });
  }

  private _subscribeTargetDoc() {
    this._targetDocUnsubscribe?.();
    this._targetDocUnsubscribe = null;

    const refDoc = this.std.workspace.getDoc(this._targetDocId);
    if (!refDoc) return;
    if (!refDoc.ready) refDoc.load();

    const targetStore = this._getUnfilteredTargetStore(refDoc);

    // There's no dedicated "block moved/reparented" slot on `Store` —
    // `moveBlocks` mutates parent/child Y.Arrays directly without going
    // through the block-added path that would otherwise trigger a re-query.
    // Fall back to the doc's raw Yjs `update` event (fires on *any* change,
    // not just moves) but debounce heavily and keep the actual refresh
    // cheap (see `_maybeRefreshPreview`) — this fires constantly during
    // normal editing, especially since the target doc is usually the same
    // doc the user is actively editing.
    const onTargetDocUpdate = () => {
      if (this._refreshDebounce) clearTimeout(this._refreshDebounce);
      this._refreshDebounce = setTimeout(() => {
        const before = this._previewStore;
        this._maybeRefreshPreview();
        if (this._previewStore !== before) {
          this.requestUpdate();
        }
      }, 300);
    };
    targetStore.spaceDoc.on('update', onTargetDocUpdate);
    this._targetDocUnsubscribe = () => {
      targetStore.spaceDoc.off('update', onTargetDocUpdate);
    };
  }

  /**
   * `UIEventDispatcher` (the source of every synthetic BlockSuite UI event,
   * including Kanban drag-and-drop's `dragStart`) tracks exactly one
   * app-wide "active" dispatcher in a *static* field
   * (`UIEventDispatcher._activeDispatcher`, `dispatcher.ts`); `run()` drops
   * every event entirely unless its own dispatcher is the active one. It
   * becomes active on `pointerdown`/`click`/`focusin`/etc. *bubbling up to
   * `this.host`* — which works fine for two sibling top-level editors, but
   * our nested `BlockStdScope`'s host is mounted as a light-DOM *descendant*
   * of the outer page's own host (this component is `ShadowlessElement`,
   * like every block). So the same pointerdown that activates our nested
   * dispatcher (correctly, since it fires first on the way up) keeps
   * bubbling past this wrapper and *also* reaches the outer host's own
   * identical listener, reactivating the outer dispatcher and silently
   * deactivating ours again — every single time. Native events unrelated to
   * this synthetic system (a right-click's `contextmenu` menu, for example)
   * are unaffected, which is exactly why "right-click > Move" kept working
   * while dragging never did. Stopping these specific events right at this
   * wrapper's boundary — after our own nested dispatcher's listener has
   * already run, since it's bound on a descendant `this.host` further down
   * — prevents the outer one from ever seeing them.
   */
  private _stopDispatcherActivationBubbling() {
    const eventNames = [
      'pointerdown',
      'click',
      'focusin',
      'dragover',
      'dragenter',
      'dragstart',
      'drop',
      'pointerenter',
    ];
    const stop = (e: Event) => e.stopPropagation();
    eventNames.forEach(name => this.addEventListener(name, stop));
    this._disposables.add(() =>
      eventNames.forEach(name => this.removeEventListener(name, stop))
    );
  }

  /**
   * `database-block.ts`'s `listenFullWidthChange()` lets a database
   * "bleed" past its note's normal text-column margins out toward the
   * real page edge — it measures
   * `this.getBoundingClientRect().left - this.host.getBoundingClientRect().left`
   * and turns that into a negative-margin/positive-padding pair, applied to
   * an element inside both the Table and Kanban view's own render
   * (`table-view-ui-logic.ts` / `kanban-view-ui-logic.ts`, both reading
   * `config.virtualPadding$` — this is a single shared signal on
   * `DatabaseBlockComponent`, not something Kanban-specific, which is why
   * a many-columns Table view hits the identical narrow-scroll symptom).
   * That measurement is only meaningful when `this.host` is the real,
   * full-width page host — for the nested `affine-database` this package
   * renders, `this.host` is our own nested `BlockStdScope`'s host instead,
   * mounted with ~0 extra offset from this wrapper, so the measured bleed
   * comes out wrong, and the view stays confined to a too-narrow width.
   *
   * A first attempt applied the equivalent bleed CSS to *this outer
   * wrapper* instead — but that doesn't help at all: the bleed lives
   * entirely inside the view's own render, driven by that component's own
   * private `virtualPadding$` signal, which nothing an ancestor does can
   * influence. `database-override.ts` disables that component's own
   * (broken-for-nested-rendering) measurement instead, and this method
   * drives its `virtualPadding$` directly.
   *
   * Measures from `nestedDatabase`'s *own* rect, not this wrapper's: an
   * earlier version measured `this.getBoundingClientRect()` (the outer
   * `affine-database-ref` wrapper) instead, reasoning that this wrapper
   * sits exactly where the nested database renders — but the nested
   * `BlockStdScope`'s own note/page chrome inserts a small additional
   * offset between the wrapper and the actual nested element, so that
   * measurement systematically overshot the real value by a roughly
   * constant amount (confirmed live: every reference on a page reported
   * the same, uniformly-too-high padding value regardless of its own
   * position, and manually forcing a smaller value fixed the visible
   * clipping — a fixed offset error, not a reactivity failure).
   *
   * Uses `autoUpdate` from `@floating-ui/dom` — the same helper
   * `database-block.ts`'s own `listenFullWidthChange()` uses — rather than
   * a plain `ResizeObserver`, since the latter only fires on *size*
   * changes, not *position* changes, and left a stale, wrong measurement
   * uncorrected for a reference whose own size never changed after an
   * early, pre-layout-settling measurement (confirmed live).
   */
  private _wiredNestedDatabase:
    | (HTMLElement & {
        virtualPadding$: { value: number };
      })
    | null = null;

  private _syncFullWidthBleed() {
    if (this.std.get(DocModeProvider).getEditorMode() === 'edgeless') return;

    const nestedDatabase = this.querySelector('affine-database') as
      | (HTMLElement & { virtualPadding$: { value: number } })
      | null;
    if (!nestedDatabase || nestedDatabase === this._wiredNestedDatabase) {
      return;
    }

    this._fullWidthBleedCleanup?.();
    this._wiredNestedDatabase = nestedDatabase;

    const update = () => {
      const outerHost = this.std.host;
      const padding =
        nestedDatabase.getBoundingClientRect().left -
        outerHost.getBoundingClientRect().left;
      const bleed = Math.max(0, padding - 72);
      nestedDatabase.virtualPadding$.value = bleed;
    };

    this._fullWidthBleedCleanup = autoUpdate(
      this.std.host,
      nestedDatabase,
      update
    );
  }

  /**
   * `database-block.ts` already persists a database's own last-displayed
   * view onto its model's `currentViewId`, and reads it back on mount — but
   * every reference to a canonical table shares that ONE canonical model
   * (see the module comment on `previewStoreRefCounts`), so if references
   * only relied on that, they'd all fight over one shared "current view"
   * instead of each independently remembering its own (which already works
   * live today, via each nested instance's own in-memory
   * `ViewManagerBase._currentViewId$`; only persistence across reload was
   * missing). This wrapper's own model — one per reference — is the
   * natural place to persist each reference's override: on mount, if this
   * reference has its own saved `currentViewId`, force the nested
   * `ViewManagerBase` onto it (overriding whatever the canonical model's own
   * value set as a fallback default); from then on, mirror every further
   * view change on the nested instance back into this reference's own prop.
   */
  private _wiredViewNestedDatabase:
    | (HTMLElement & {
        // `database-block.ts`'s own `dataSource` field is `lazy(() => ...)`,
        // which (per `data-view/src/core/utils/lazy.ts`) returns a plain
        // `{ value: T }` getter object, NOT a callable — an earlier version of
        // this fix called it as `nestedDatabase.dataSource()`, which threw
        // "dataSource is not a function" on every render (confirmed live).
        dataSource: {
          value: {
            viewManager: {
              viewGet: (id: string) => unknown;
              setCurrentView: (id: string) => void;
              currentViewId$: {
                value: string | undefined;
                subscribe: (fn: (id: string | undefined) => void) => () => void;
              };
            };
          };
        };
      })
    | null = null;

  private _viewSyncCleanup: (() => void) | null = null;

  private _syncCurrentView() {
    const nestedDatabase = this.querySelector('affine-database') as
      | (HTMLElement & {
          dataSource: {
            value: {
              viewManager: {
                viewGet: (id: string) => unknown;
                setCurrentView: (id: string) => void;
                currentViewId$: {
                  value: string | undefined;
                  subscribe: (
                    fn: (id: string | undefined) => void
                  ) => () => void;
                };
              };
            };
          };
        })
      | null;
    if (!nestedDatabase) return;

    let viewManager: (typeof nestedDatabase)['dataSource']['value']['viewManager'];
    try {
      viewManager = nestedDatabase.dataSource.value.viewManager;
    } catch (e) {
      // Constructing `DatabaseBlockDataSource` shouldn't throw in practice,
      // but this runs from a `MutationObserver` callback — an uncaught
      // exception here would silently break that observer for every future
      // mutation, not just this one call.
      console.error('[database-ref] failed to read nested view manager', e);
      return;
    }

    if (nestedDatabase !== this._wiredViewNestedDatabase) {
      this._viewSyncCleanup?.();
      this._wiredViewNestedDatabase = nestedDatabase;

      // Apply this reference's own saved view *before* subscribing.
      // `signal.subscribe(fn)` (preact-signals) fires `fn` immediately and
      // synchronously with whatever is currently live, the moment you
      // subscribe — not only on future changes. Subscribing first (as an
      // earlier version of this did) meant that immediate fire wrote
      // whatever the pre-override default happened to be straight back
      // into this reference's own model, clobbering the very value we
      // were about to apply, before the override line below ever ran.
      // Confirmed live: two references to the same table always
      // converged onto whichever view id happened to be the shared
      // default, silently discarding the other's distinct saved choice —
      // exactly what this ordering produces.
      const ownViewId = this.model.props.currentViewId;
      if (ownViewId && viewManager.viewGet(ownViewId)) {
        viewManager.setCurrentView(ownViewId);
      }

      this._viewSyncCleanup = viewManager.currentViewId$.subscribe(id => {
        if (id) this.model.props.currentViewId = id;
      });
    }

    // Re-checked on *every* call, not just the first time this
    // nestedDatabase is wired: this runs from both `updated()` and the
    // range-exclusion `MutationObserver` (see `_observeForRangeQueryExclusion`)
    // specifically because a one-shot check tied only to `updated()` can
    // race the nested `<editor-host>`'s own, later, independent Lit update
    // cycle (confirmed live: `updated()` fires once right after this
    // wrapper's own render settles, before the nested `affine-database`
    // exists yet, and never fires again since nothing else on this
    // wrapper's own reactive state changes afterward — so a check tied
    // only to it can permanently miss the child). Safe to redo
    // unconditionally: `setCurrentView` with an already-current id is a
    // no-op.
    const ownViewId = this.model.props.currentViewId;
    if (
      ownViewId &&
      viewManager.currentViewId$.value !== ownViewId &&
      viewManager.viewGet(ownViewId)
    ) {
      viewManager.setCurrentView(ownViewId);
    }
  }

  override updated() {
    this._syncFullWidthBleed();
    this._syncCurrentView();
  }

  override connectedCallback() {
    super.connectedCallback();
    this._maybeRefreshPreview();
    this._subscribeTargetDoc();
    this._observeForRangeQueryExclusion();
    this._stopDispatcherActivationBubbling();

    const markActive = () => {
      const { refBlockId } = this.model.props;
      if (refBlockId) lastActiveRefIdByCanonical.set(refBlockId, this.model.id);
    };
    this.addEventListener('pointerdown', markActive, { capture: true });
    this._disposables.add(() =>
      this.removeEventListener('pointerdown', markActive, { capture: true })
    );

    this._disposables.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'refDocId' || key === 'refBlockId') {
          this._maybeRefreshPreview();
          this._subscribeTargetDoc();
          this.requestUpdate();
        } else if (key === 'currentViewId') {
          // A late-arriving Yjs sync of this reference's own saved view
          // (e.g. still hydrating right after a reload) needs another
          // `updated()` pass so `_syncCurrentView` gets a chance to apply
          // it — it isn't watched by any other trigger here.
          this.requestUpdate();
        }
      })
    );

    this._disposables.add(() => {
      this._targetDocUnsubscribe?.();
      if (this._refreshDebounce) clearTimeout(this._refreshDebounce);
      this._rangeExcludeObserver?.disconnect();
      this._fullWidthBleedCleanup?.();
      this._viewSyncCleanup?.();
      this._replacePreviewStore(null, null, null);
    });
  }

  override render() {
    if (this._resolveError) {
      return html`<div class="affine-database-ref-error">
        ${this._resolveError}
      </div>`;
    }

    if (!this._previewStore) return nothing;

    return html`${guard([this._previewStore], () => {
      return this._previewStore
        ? new BlockStdScope({
            store: this._previewStore,
            extensions: this._previewSpec,
          }).render()
        : nothing;
    })}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-database-ref': DatabaseRefBlockComponent;
  }
}
