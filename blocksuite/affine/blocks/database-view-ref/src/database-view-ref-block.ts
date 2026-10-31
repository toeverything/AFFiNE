import {
  installDeleteRedirect,
  markActiveRef,
} from '@blocksuite/affine-block-database-ref';
import { ViewExtensionManagerIdentifier } from '@blocksuite/affine-ext-loader';
import type { DatabaseViewRefBlockModel } from '@blocksuite/affine-model';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import { BlockComponent, BlockStdScope } from '@blocksuite/std';
import { RANGE_QUERY_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import type { BlockModel, Query, Store } from '@blocksuite/store';
import { autoUpdate } from '@floating-ui/dom';
import { css, html, nothing } from 'lit';
import { guard } from 'lit/directives/guard.js';

import { DatabaseViewRefPreviewRootOverride } from './preview-root.js';
import { createLocalViewOverride } from './view-override.js';

/**
 * Same ref-counting hazard `database-ref-block.ts` documents at length for
 * its own identical `previewStoreRefCounts` — duplicated here rather than
 * imported since these are package-private, and this package doesn't share
 * `refDoc.getStore({query})` cache entries with `database-ref`'s own (each
 * block flavour's own `Query`/cache key is independent even when both point
 * at the same canonical, since the cache key is derived from the *query
 * object*, not the referencing block's flavour).
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
 * `refBlockId` + `refDocId` — the exact same nested-`BlockStdScope`-over-a
 * -`Query`-filtered-`Store` mechanism `database-ref-block.ts` uses (see
 * that file's own extensive comments for the full "why" behind the view
 * spec choice, the `guard()`-based perf guard, and the ancestor-chain
 * cache-invalidation logic — reused verbatim here, not re-derived).
 *
 * The one behavioral difference from `database-ref`: this reference's own
 * `views`/`currentViewId` are stored on *this* model, not mirrored from the
 * canonical's shared `views` — wired via `DatabaseViewLocalOverrideProvider`
 * (`@blocksuite/affine-block-database`), set on the nested
 * `DatabaseBlockDataSource` by `database-block.ts`'s own `dataSource` lazy
 * getter the moment it detects `this.closest('affine-database-view-ref')`.
 * This component only needs to expose a `viewLocalOverride` property on
 * itself (duck-typed, read by that getter) — the actual override object
 * (`createLocalViewOverride`) does all the real work.
 *
 * The "Delete Database" more-menu action's delete-redirect
 * (`database-ref-block.ts`'s `installDeleteRedirect`) is reused here rather
 * than reimplemented: a canonical simultaneously referenced by both a
 * `database-ref` and a `database-view-ref` shares the *same* cached preview
 * `Store` (the cache key only depends on the query, not which block flavour
 * built it), so `installDeleteRedirect` is exported from `database-ref` and
 * called from both flavours' own `_maybeRefreshPreview` — whichever
 * reference resolves the shared store first wins the one patch install
 * (module-private `patchedPreviewStores` WeakSet lives in `database-ref`).
 * Both flavours also call the exported `markActiveRef` on `pointerdown`, so
 * "which reference was last active" resolves correctly regardless of which
 * flavour the user actually interacted with.
 */
export class DatabaseViewRefBlockComponent extends BlockComponent<DatabaseViewRefBlockModel> {
  static override styles = css`
    affine-database-view-ref {
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
      DatabaseViewRefPreviewRootOverride,
    ];
  }

  private get _targetDocId(): string {
    return this.model.props.refDocId || this.std.store.id;
  }

  /**
   * Read by `database-block.ts`'s own `dataSource` lazy getter via
   * `this.closest('affine-database-view-ref')?.viewLocalOverride` — see
   * that file's comment for why this is duck-typed rather than a real
   * import (keeps `@blocksuite/affine-block-database` from ever depending
   * on this package). Must be synchronously available the first time
   * that getter runs (constructing the nested `DatabaseBlockDataSource`) —
   * a lazily-*computed* getter, not an async-populated field, since an
   * earlier version set this from inside a dynamic `import().then(...)`
   * in `connectedCallback`, which raced the nested component's own,
   * synchronous first read and lost every time (confirmed live: the
   * override was still `null` at the exact moment it was needed).
   */
  private _viewLocalOverride: ReturnType<
    typeof createLocalViewOverride
  > | null = null;

  get viewLocalOverride() {
    if (!this._viewLocalOverride) {
      this._viewLocalOverride = createLocalViewOverride(this.model);
    }
    return this._viewLocalOverride;
  }

  /**
   * The REAL outer page's `std` — this component itself is never nested
   * (unlike the `affine-database` it renders internally, which lives
   * inside a brand-new, query-filtered `BlockStdScope` over the
   * canonical's own backing doc — see `_maybeRefreshPreview`/
   * `this._previewStore`). Read the same way `viewLocalOverride` is (duck
   * -typed via `this.closest('affine-database-view-ref')`, from
   * `database-block.ts`'s own lazy `dataSource` getter) so that
   * `EditorHostKey` resolves to the outer page inside the nested
   * `affine-database`'s cell renderers too — Story 2.6's row-hover note
   * button, in particular, needs to insert a `note-ref` on the page the
   * user is actually viewing, not into the (usually different, often
   * cross-doc) canonical's own document, which is what happened before
   * this fix (confirmed live: the note-ref was created, just invisibly,
   * inside the canonical's own filtered preview doc).
   */
  get outerStd() {
    return this.std;
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

  private _getUnfilteredTargetStore(refDoc: Store['doc']): Store {
    if (refDoc === this.std.store.doc) {
      return this.std.store;
    }
    return refDoc.getStore({ id: refDoc.id });
  }

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
    if (!refDoc.ready) refDoc.load();

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
    // `refDoc.getStore({ query })` only *constructs* the Store — every
    // `StoreExtension`'s own `loaded()` lifecycle hook (attaching its real
    // event listeners, computing its own initial state) doesn't run until
    // `Store.load()` is explicitly called, a *separate* step from
    // `Doc.load()`. Confirmed live as (half of) the root cause of a real
    // bug: undo (Mod-z) silently did nothing for edits made inside a
    // cross-doc List view (Journal Todo), even though the edits themselves
    // genuinely landed on the real source doc. `HistoryExtension`
    // (`store.ts`'s own `_history` getter) is exactly such an extension —
    // its `_canUndo`/`_canRedo` signals (what `Store.canUndo`/`.canRedo`
    // actually read) stay frozen at their construction-time default
    // (`false`) forever unless `loaded()` runs, regardless of how many
    // real, undo-stack-worthy edits happen afterward, since the event
    // listeners that would update them are *also* only attached inside
    // that same `loaded()` call. `database-ref-block.ts`'s and
    // `note-ref-block.ts`'s own `_maybeRefreshPreview` both already have
    // this identical fix — this file was the one sibling that missed it.
    nextPreviewStore.load();
    installDeleteRedirect(
      nextPreviewStore,
      targetModel.id,
      this.std.store,
      this.std.host
    );
    this._replacePreviewStore(nextPreviewStore, refDoc, query);
    this._resolveError = null;
  }

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

  private _excludeSubtreeFromOuterRangeQueries(node: Element) {
    // `node` comes from a MutationObserver callback and is only ever a base
    // `Element` — `.dataset` is `HTMLElement`-only, so `hasAttribute` (not
    // the usually-preferred `dataset`) is the only option that's actually
    // typesafe here.
    // oxlint-disable-next-line unicorn/prefer-dom-node-dataset
    if (node.hasAttribute('data-block-id')) {
      node.setAttribute(RANGE_QUERY_EXCLUDE_ATTR, 'true');
    }
    node
      .querySelectorAll('[data-block-id]')
      .forEach(el => el.setAttribute(RANGE_QUERY_EXCLUDE_ATTR, 'true'));
  }

  private _observeForRangeQueryExclusion() {
    this._rangeExcludeObserver?.disconnect();
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
   * Unlike `database-ref-block.ts`'s identically-named method, this
   * doesn't need to guard against a *shared* canonical's `currentViewId` —
   * this reference's own `views`/`currentViewId` are already fully local
   * (the whole point of this block), so there's no risk of one reference's
   * tab choice leaking into another's. Still needs the same
   * apply-before-subscribe ordering, for the same reason: `signal.subscribe`
   * fires synchronously with whatever is currently live the moment you
   * subscribe, which would otherwise clobber the saved value with the
   * nested view manager's own pre-override default.
   */
  private _wiredViewNestedDatabase:
    | (HTMLElement & {
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
      console.error(
        '[database-view-ref] failed to read nested view manager',
        e
      );
      return;
    }

    if (nestedDatabase !== this._wiredViewNestedDatabase) {
      this._viewSyncCleanup?.();
      this._wiredViewNestedDatabase = nestedDatabase;

      const ownViewId = this.model.props.currentViewId;
      if (ownViewId && viewManager.viewGet(ownViewId)) {
        viewManager.setCurrentView(ownViewId);
      }

      this._viewSyncCleanup = viewManager.currentViewId$.subscribe(id => {
        if (id) this.model.props.currentViewId = id;
      });
    }

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
      if (refBlockId) markActiveRef(refBlockId, this.model.id);
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
      return html`<div class="affine-database-view-ref-error">
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
    'affine-database-view-ref': DatabaseViewRefBlockComponent;
  }
}
