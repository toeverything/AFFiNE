import { PageClipboard } from '@blocksuite/affine-block-root';
import { ViewExtensionManagerIdentifier } from '@blocksuite/affine-ext-loader';
import type { NoteRefBlockModel } from '@blocksuite/affine-model';
import { resolveColor } from '@blocksuite/affine-model';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import { ensureDocLoaded } from '@blocksuite/affine-shared/utils';
import { BlockComponent, BlockStdScope, TextSelection } from '@blocksuite/std';
import { RANGE_QUERY_EXCLUDE_ATTR } from '@blocksuite/std/inline';
import type { BlockModel, Query, Store } from '@blocksuite/store';
import { css, html, nothing } from 'lit';
import { guard } from 'lit/directives/guard.js';

import { NoteRefPreviewRootOverride } from './preview-root';
import { caretKey, shouldPlaceCaretAfterTap } from './touch-caret.js';

/**
 * Every reference to the same cross-doc canonical Note shares one
 * `refDoc.getStore({query})` instance (the query only depends on the
 * canonical's own ancestor chain, not on which reference asked for it —
 * same caching behavior `database-ref` documents for its own preview
 * store). Ref-counted so the store (and its entire independent reactive
 * object graph — see `database-ref-block.ts`'s own module comment on this
 * exact hazard) is only disposed once nothing renders through it anymore,
 * mirroring that file's `previewStoreRefCounts`/`retain`/`releasePreviewStore`
 * exactly (duplicated locally rather than imported — these are
 * `database-ref`-package-private, and Note doesn't share its canonical's
 * exact query shape).
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
 * Note-ref instances currently in the brief window right after
 * `_reclaimFocusAfterSelectionChange` re-synced the native `Range` — see
 * that method's own doc comment for the full mechanism this exists to
 * counteract. Populated/cleared by that method; read only by
 * `_installScrollIntoViewSuppression`'s own patched `scrollIntoView`.
 */
const suppressingScrollIntoView = new WeakSet<NoteRefBlockComponent>();

let scrollIntoViewPatched = false;

/**
 * A snapshot-then-restore approach (this file's earlier fix) corrects
 * `rich-text.ts`'s own unwanted `scrollIntoView` call *after* it's
 * already happened — which is still visibly a jump, just one that lands
 * back in the right place a moment later, confirmed live as its own
 * separate, jarring jitter ("jumps up and then down"). Preventing the
 * call itself, rather than correcting for it, is the only way to get to
 * genuinely zero visible movement. `rich-text.ts` is shared framework
 * code with its own legitimate reasons to auto-scroll elsewhere (see
 * this story's own Change Log for why that behavior is correct and
 * wanted for ordinary typing) — patching `Element.prototype.
 * scrollIntoView` globally would be far too broad a hammer. Scoped
 * instead to only suppress calls whose target element is inside a
 * note-ref that's *currently* in its own brief post-reclaim window
 * (tracked via `suppressingScrollIntoView`, keyed by component instance)
 * — every other `scrollIntoView` call on the page, including this exact
 * same reference's own content once the user scrolls it out of view on
 * purpose, is completely unaffected. Installed once, lazily, the first
 * time any note-ref actually needs it, rather than at module load —
 * keeps this from ever touching global prototypes for pages that never
 * render a cross-doc reference at all.
 */
function ensureScrollIntoViewSuppressionInstalled() {
  if (scrollIntoViewPatched) return;
  scrollIntoViewPatched = true;
  const original = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (
    this: Element,
    ...args: Parameters<typeof original>
  ) {
    const owner = this.closest(
      'affine-note-ref'
    ) as NoteRefBlockComponent | null;
    if (owner && suppressingScrollIntoView.has(owner)) return;
    return original.apply(this, args);
  };
}

/**
 * Renders a live view of a single `affine:note` block, addressed by
 * `refBlockId` + `refDocId`.
 *
 * Two entirely different rendering mechanisms, chosen by `_isCrossDoc()`:
 *
 * SAME-DOC (`refDocId` unset or equal to the current doc, Story 0.6):
 * the *thinnest possible* mechanism — `BlockComponent` (the base class
 * every block, including `affine-note`'s own, extends) picks up `std`/
 * `store` via Lit's `@consume({context})`, resolved from whichever
 * `EditorHost` is its nearest DOM ancestor, not from however it got added
 * to that DOM. So rendering the canonical note's children here, through
 * `this.std.host.renderChildren(canonical)`, uses the exact same std,
 * store, dispatcher, selection/range manager, and keymaps as any other
 * block on the page — no nested `BlockStdScope`, no second `Store`, no
 * synchronization to ever get out of sync, because there is only ever one
 * of each.
 *
 * CROSS-DOC (`refDocId` genuinely different, Story 0.5): the same-doc
 * mechanism above cannot work here — `BlockComponent.model`/`.store`
 * (the base every rendered block relies on, all the way down) resolve via
 * the *ambient* `std.store`, the one shared store for the *current* doc.
 * A cross-doc canonical's children simply don't exist in that store at
 * all, so every child would silently fail to resolve its own model the
 * moment it mounts (confirmed live: `Cannot find block model for id N`,
 * thrown from deep inside `paragraph-block.ts`'s own `connectedCallback`,
 * for every single child). This mounts a genuinely separate nested
 * `BlockStdScope` bound to a `Query`-filtered `Store` for the *foreign*
 * doc instead — exactly `database-ref`'s own proven cross-doc mechanism
 * (`database-ref-block.ts`), adapted for Note. This reintroduces a second,
 * independent dispatcher/selection/view-registry — the same tradeoff
 * `database-ref`/`surface-ref` already carry for their own cross-doc
 * cases — which is why the same-doc path above deliberately avoids it
 * whenever it doesn't have to.
 */
export class NoteRefBlockComponent extends BlockComponent<NoteRefBlockModel> {
  static override styles = css`
    affine-note-ref {
      display: block;
      /* CSS scroll anchoring (on by default in Chromium) picks a DOM
       * node near the top of the viewport as an "anchor" and adjusts
       * scrollTop to keep it visually stationary whenever content above
       * it changes size — entirely at the rendering-engine level, with
       * no JS-callable hook of any kind. Confirmed live, via a console
       * script that monkey-patched every scroll-related API (scrollTo,
       * scrollBy, scroll, scrollIntoView, a direct .scrollTop= property
       * write) plus Selection.addRange, that a real scroll container's
       * scrollTop jumped by over 1000px with *none* of those APIs ever
       * being called — the only mechanism left that fits is the browser
       * doing this on its own. The cross-doc reference's own structural
       * edits (Enter, a markdown-shortcut conversion) tear down and
       * rebuild this entire nested BlockStdScope's worth of DOM at
       * once (see _maybeRefreshPreview's own comment on why a full
       * Query/Store rebuild is sometimes unavoidable) — a much
       * larger, more disruptive replacement than ordinary typing ever
       * produces, and exactly the kind of change that can confuse the
       * anchor-selection heuristic if it happened to have picked a node
       * from inside this volatile subtree. overflow-anchor: none
       * excludes this component's own subtree from ever being chosen as
       * that anchor, without disabling scroll anchoring for the rest of
       * the page (where it's legitimately useful, e.g. content loading
       * in above the viewport elsewhere).
       */
      overflow-anchor: none;
    }
    affine-note-ref[data-show-border='true'] {
      border: 1px solid var(--affine-border-color);
      border-radius: 4px;
      padding: 4px 8px;
    }
  `;

  private _targetDocUnsubscribe: (() => void) | null = null;

  private _refreshDebounce: ReturnType<typeof setTimeout> | null = null;

  private _rangeExcludeObserver: MutationObserver | null = null;

  // Cross-doc-only state (nested `BlockStdScope` path).
  private _previewStore: Store | null = null;

  // The nested scope's own `BlockStdScope` instance, captured so
  // `_stopDispatcherActivationBubbling` can explicitly activate its
  // dispatcher (see that method's own doc comment for why this is needed
  // in addition to, not instead of, stopping propagation).
  private _previewStd: BlockStdScope | null = null;

  private _previewRefDoc: Store['doc'] | null = null;

  private _previewQuery: Query | null = null;

  private _resolveError: string | null = null;

  private _ancestorChain: string[] = [];

  // Unsubscribes the current `_previewStd`'s own `TextSelection`-changed
  // listener (see `_reclaimFocusAfterSelectionChange`'s doc comment) —
  // rebound whenever `_previewStd` itself is replaced with a new instance.
  private _previewSelectionSubscription: { unsubscribe: () => void } | null =
    null;

  // Where the user was last actively editing, tracked at the *component*
  // level rather than read fresh off whichever `_previewStd` happens to be
  // current — deliberately, because a structural edit (Enter, a
  // markdown-shortcut conversion) can trigger `_maybeRefreshPreview` to
  // rebuild the whole nested `Query`/`Store`/`BlockStdScope` (new ids
  // becoming visible — see that method's own comment) in the *same*
  // window `_reclaimFocusAfterSelectionChange` is trying to restore focus
  // in. Confirmed via a real Playwright-driven browser reproduction (not
  // just console diagnostics): the reclaim's own polling loop, holding
  // only a reference to the *old*, about-to-be-discarded `_previewStd`,
  // was chasing a block that could never appear there — it only existed
  // in the *replacement* std that superseded it moments later. Recording
  // "what the user meant to focus" independent of which std instance
  // currently owns it lets the reclaim keep going against whichever std
  // is actually current at each retry, and lets a brand-new std (which
  // starts with no `TextSelection` of its own at all) pick up the same
  // intent instead of only ever reacting to a `TextSelection` it will
  // never independently arrive at on its own.
  private _pendingFocus: { blockId: string; index: number } | null = null;

  // `_reclaimFocusAfterSelectionChange` itself calls `std.selection.
  // setGroup(...)` to restore the caret, which synchronously fires the very
  // `selection.slots.changed` subscription that calls it — the
  // `activeInScope` check below is meant to break that cycle once real DOM
  // focus lands, but doesn't reliably do so in every case (confirmed live:
  // a profile capture showed this function dominating ~65% of all CPU
  // samples, a self-sustaining setGroup -> selection-changed -> reclaim ->
  // setGroup loop that pegs the tab and makes the page unresponsive). Set
  // for the duration of the synchronous selection-restoring work below so
  // the re-entrant subscription firing can recognize "this is my own echo,
  // not a new selection to reclaim" and skip re-triggering, independent of
  // focus-timing.
  private _isReclaimingFocus = false;

  // `_ensureTrailingParagraph`'s own `addBlock` call is itself a Y.doc
  // mutation, which re-fires `_subscribeTargetDoc`'s doc-update listener —
  // the same debounced path that calls `_ensureTrailingParagraph` in the
  // first place. A second profiler capture (navigating into a page whose
  // note contains another note reference) showed that doc-update handler
  // firing hundreds of times over the capture window — a genuine, ongoing
  // stream of Y.doc mutations, not just re-renders — with this method the
  // only thing in that path that writes to the doc at all. Guards a real
  // second trailing-paragraph add within this window; no legitimate case
  // needs one added milliseconds after the last.
  private _lastTrailingParagraphAddedAt = 0;

  // `_reclaimFocusAfterSelectionChange` also gets triggered fresh (not via
  // its own guarded recursion) every time `_maybeRefreshPreview` swaps in a
  // brand-new `_previewStd` while `_pendingFocus` is set — documented,
  // intentional behavior for the "a structural edit replaced the std
  // mid-poll" case. But forcing a `note-ref` nested inside another
  // reference onto this same cross-doc machinery (see
  // `_isNestedInAnotherReference`) means that std-rebuild path now runs far
  // more often than it used to for a plain top-level reference — a third
  // profiler capture showed this function back to dominating ~39% of all
  // samples, each a full, legitimate (bounded, 60-attempt) polling burst,
  // just triggered over and over. Rate-limits *fresh* top-level attempts
  // only (detected via the default `attemptsLeft` — an in-progress bounded
  // retry chain always passes an explicit, decremented value and is never
  // throttled here) — no legitimate case needs a new one within 250ms of
  // the last.
  private _lastFreshReclaimAttemptAt = 0;

  // Scroll position captured at the *earliest* possible moment — see
  // `_snapshotScrollIfNeeded`'s own comment for why timing here is not a
  // minor detail: a snapshot taken even one async tick too late has
  // already observed corrupted state (confirmed live), making the
  // "restore" actively lock in the wrong position instead of fixing
  // anything.
  private _scrollSnapshot: { el: Element | Window; top: number }[] | null =
    null;

  // When `_scrollSnapshot` was actually captured — not just "is it set",
  // which was the only thing checked before. `_snapshotScrollIfNeeded`'s
  // own "don't overwrite an existing snapshot" guard is meant to protect a
  // snapshot from being *replaced* by a later, already-drifted one taken
  // mid-poll (its own doc comment) — it was never meant to let a snapshot
  // sit unconsumed indefinitely. But `_snapshotScrollIfNeeded` is also
  // called from `_subscribeTargetDoc`'s doc-update handler independently
  // of whether a reclaim ever actually follows — confirmed live: a
  // snapshot taken once (scrollTop legitimately 0, e.g. near page load)
  // and never consumed sat there until an unrelated reclaim, triggered
  // much later by a slash-menu equation insert after the user had scrolled
  // deep into the page, reused that stale value and forced the page back
  // to the top. A snapshot older than this is treated as unusable —
  // discarded in favor of a fresh one — rather than "the only one we
  // have."
  private _scrollSnapshotTakenAt = 0;

  private static readonly SCROLL_SNAPSHOT_MAX_AGE_MS = 2000;

  /**
   * Render-time backstop against unbounded recursive nesting: reference
   * creation (`insertNoteRefBlockCommand`, `cycle.ts`) already rejects any
   * reference that would form a cycle, but that's not a hard guarantee for
   * every possible way a `note-ref` could end up pointing where it does
   * (e.g. data from before this check existed, or a chain of references
   * deep enough to be merely slow rather than truly cyclic). Since this
   * component's rendered content is always a literal DOM descendant of
   * itself (`renderBlock`'s nested `BlockStdScope.render()` mounts into
   * this element's own light DOM), any ancestor `<affine-note-ref>` already
   * resolving to the exact same target means rendering it again here would
   * recurse: that nested copy would itself try to render the same target,
   * which contains this same reference, forever. Checked once per
   * `connectedCallback`/target-change rather than continuously — a cycle
   * that exists is structural, not something that starts or stops existing
   * between renders.
   */
  private _wouldRenderCycle(targetDocId: string, targetBlockId: string) {
    let ancestor = this.parentElement;
    while (ancestor) {
      if (ancestor.tagName.toLowerCase() === 'affine-note-ref') {
        const ancestorComponent = ancestor as NoteRefBlockComponent;
        const ancestorDocId =
          ancestorComponent.model.props.refDocId ||
          ancestorComponent.std.store.id;
        const ancestorBlockId = ancestorComponent.model.props.refBlockId;
        if (
          ancestorDocId === targetDocId &&
          ancestorBlockId === targetBlockId
        ) {
          return true;
        }
      }
      ancestor = ancestor.parentElement;
    }
    return false;
  }

  private get _previewSpec() {
    return [
      ...this.std.get(ViewExtensionManagerIdentifier).get('preview-page'),
      NoteRefPreviewRootOverride,
      // 'preview-page' registers `ReadOnlyClipboard` (copy only, no paste
      // handler at all) — appropriate for its other, genuinely read-only
      // preview use cases, but wrong here: this reference is meant to be
      // fully editable. Without a paste handler in this nested scope,
      // pasting while focused inside it falls through to the *outer*
      // page's own `PageClipboard` instead (confirmed live: pasted
      // content landing outside the note entirely). `PageClipboard`
      // registers under a different key (`affine-page-clipboard` vs
      // `affine-readonly-clipboard`) so this adds a second, fully-capable
      // clipboard watcher alongside the read-only one rather than
      // replacing it — the read-only one's own `copy` handling still runs
      // too, which is harmless (both do the same copy operation).
      PageClipboard,
    ];
  }

  private get _targetDocId(): string {
    return this.model.props.refDocId || this.std.store.id;
  }

  private get _isCrossDoc(): boolean {
    return (
      (!!this.model.props.refDocId &&
        this.model.props.refDocId !== this.std.store.id) ||
      this._isNestedInAnotherReference()
    );
  }

  /**
   * The same-doc path's entire premise (see this class's own doc comment)
   * is "there is only ever one std/store" — true for a `note-ref` rendered
   * directly on the page, but not for one rendered as part of *another*
   * reference's own content: a cross-doc reference's preview mounts a
   * genuinely separate, `Query`-scoped `BlockStdScope`/`Store` restricted
   * to *its own* canonical's subtree (`_maybeRefreshPreview`'s `mode:
   * 'include'` query), and `this.std` for anything rendered inside that
   * preview — including a nested `note-ref` — is that same restricted one,
   * not the real page's. Taking the same-doc fast path there means
   * `renderBlock`'s `this.std.host.renderChildren(canonical)` resolves
   * each child's `blockViewType` via that restricted store
   * (`EditorHost._renderModel`'s own `this.store.getBlock(model.id)`) —
   * and since this reference's own target was never part of the outer
   * query's explicit include list, every child defaults to hidden and
   * renders as nothing at all (confirmed live: "a note referencing a note
   * containing a note" renders the inner reference as an empty colored
   * line, not its content). Forcing the cross-doc path here — even for a
   * target in the *same* underlying doc as the outer reference — mounts
   * this reference's own independent, unrestricted `BlockStdScope`
   * instead, sidestepping the outer preview's restriction entirely.
   */
  private _isNestedInAnotherReference(): boolean {
    let ancestor = this.parentElement;
    while (ancestor) {
      if (ancestor.tagName.toLowerCase() === 'affine-note-ref') return true;
      ancestor = ancestor.parentElement;
    }
    return false;
  }

  private _getCanonical(): BlockModel | null {
    const refDoc = this.std.workspace.getDoc(this._targetDocId);
    if (!refDoc) return null;
    ensureDocLoaded(refDoc);

    // Always fetches the plain, query-*unrestricted* store for `refDoc` via
    // its bare `id` — `StoreContainer.getStore` caches by key, and a plain
    // `id` (no `query`) is the same cache key the doc's own top-level store
    // was originally constructed with, so this is the *same* cached
    // instance as `this.std.store` in the ordinary (not-nested) case, at no
    // extra cost. That equivalence breaks down for a `note-ref` rendered
    // *inside* another cross-doc reference's preview, though: there,
    // `this.std.store` is `_maybeRefreshPreview`'s own `mode: 'include'`
    // query-scoped store (deliberately restricted to the outer canonical's
    // own subtree) — a *different* nested note-ref's target living in the
    // same underlying doc, but outside that subtree, would previously
    // resolve via that same restricted store and render as empty (viewType
    // defaults to hidden for anything the outer query didn't explicitly
    // include) — the reported "note inside a note doesn't render, just a
    // single colored line" symptom. Fetching by plain `id` here always
    // gets the real, unrestricted store regardless of which store this
    // component's own `this.std` happens to be scoped to.
    const targetStore = refDoc.getStore({ id: refDoc.id });

    const canonical = targetStore.getBlock(this.model.props.refBlockId)?.model;
    if (!canonical || canonical.flavour !== 'affine:note') return null;
    return canonical;
  }

  // ---------------------------------------------------------------------
  // Same-doc path (Story 0.6) — unchanged from before Story 0.5.
  // ---------------------------------------------------------------------

  /**
   * The canonical note's real children render as ordinary light-DOM
   * `[data-block-id]` elements, indistinguishable from first-class page
   * content to a naive DOM walk — so a text-range selection sweeping
   * across this reference could otherwise resolve the real canonical
   * note's children as "in range" and delete them directly (the same
   * hazard `database-ref` and `surface-ref` both guard against for their
   * own nested previews, for the identical structural reason).
   *
   * Unlike those two, though, this reference's content is ordinary rich
   * text that the user actually edits in place — and `RangeManager`'s
   * `[data-block-id]:not([data-range-query-exclude])` selector (see
   * `getSelectedBlockComponentsByRange`) is also what commands like
   * `getSelectedModelsCommand` use to resolve "the block(s) the cursor is
   * currently in" (e.g. for slash-menu actions that insert a sibling
   * block). A *permanent* blanket exclusion — which is what `database-ref`
   * and `surface-ref` both use, safely, since neither one's nested content
   * is ever a `getSelectedModelsCommand` target — silently makes every
   * such command see zero selected models while the cursor is anywhere
   * inside this reference, breaking things like "insert a database here"
   * without any visible error.
   *
   * So instead this only excludes the subtree while the current selection
   * is *not* fully contained within it — i.e. while some other, external
   * range could be sweeping across this reference's boundary. While the
   * user's cursor/selection lives entirely inside (the normal editing
   * case), the exclusion is lifted so ordinary block-resolution commands
   * work exactly as they would for non-referenced content.
   *
   * Only used for the same-doc path — the cross-doc path's nested scope
   * has its own entirely separate selection system, so this reactive
   * approach doesn't apply there (see `_observeForCrossDocRangeExclusion`).
   */
  private readonly _updateRangeQueryExclusion = () => {
    const descendants = Array.from(
      this.querySelectorAll<HTMLElement>('[data-block-id]')
    );
    if (descendants.length === 0) return;

    const selections = this.std.selection.value;
    const referencedBlockIds = new Set<string>();
    for (const sel of selections) {
      referencedBlockIds.add(sel.blockId);
      if (sel.is(TextSelection) && sel.to) {
        referencedBlockIds.add(sel.to.blockId);
      }
    }

    const descendantIds = new Set(descendants.map(el => el.dataset.blockId));
    const allInside =
      referencedBlockIds.size > 0 &&
      Array.from(referencedBlockIds).every(id => descendantIds.has(id));

    descendants.forEach(el => {
      if (allInside) {
        el.removeAttribute(RANGE_QUERY_EXCLUDE_ATTR);
      } else {
        el.setAttribute(RANGE_QUERY_EXCLUDE_ATTR, 'true');
      }
    });
  };

  private _observeForRangeQueryExclusion() {
    this._rangeExcludeObserver?.disconnect();
    this._updateRangeQueryExclusion();
    this._rangeExcludeObserver = new MutationObserver(() => {
      this._updateRangeQueryExclusion();
    });
    this._rangeExcludeObserver.observe(this, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * When the *same* canonical note is referenced by more than one `note-ref`
   * simultaneously visible on a page, its content genuinely renders in more
   * than one place at once — each occurrence is a distinct `BlockComponent`
   * instance, but all of them share the same underlying block id (since
   * they're the same Yjs blocks, addressed identically). `ViewStore`
   * (`this.std.view`), though, is a single global `id -> BlockComponent` map
   * with no concept of "which occurrence" — `setBlock` just has the latest
   * registrant win, unconditionally (see `ViewStore.setBlock`). Any command
   * that resolves "the component for this block id" through it (e.g. the
   * slash-menu widget's `getInlineEditorByModel`/`host.view.getBlock` calls)
   * then silently operates on whichever occurrence happened to mount last,
   * not necessarily the one the user is actually typing in — which reads as
   * the slash menu (and similar id-based commands) mysteriously not working
   * in one of the two copies.
   *
   * Only relevant for the same-doc path — the cross-doc path's nested
   * scope has its own entirely separate `ViewStore`, so there's no shared
   * registry to fight over there.
   *
   * A real per-instance registry would need a broader `ViewStore` change
   * (out of scope for a single reference type). Instead, this reclaims
   * registration for every block rendered by *this* `note-ref` occurrence
   * the moment the user starts interacting with it — each embedded block
   * element already *is* its own `BlockComponent` instance (the custom
   * element and the component are the same object), so re-registering is
   * just calling `setBlock` again on it. This doesn't fix the ambiguity in
   * general (switching focus between the two copies without a fresh
   * pointerdown/focusin could still race), but it does fix the overwhelmingly
   * common case: the copy you just clicked/tapped into becomes "the"
   * registered one for as long as you keep working in it.
   */
  private readonly _reclaimViewRegistration = () => {
    this.querySelectorAll<BlockComponent>('[data-block-id]').forEach(el => {
      this.std.view.setBlock(el);
    });
  };

  /**
   * A note rendered top-level on the page always has a landing spot after
   * its last block, however that block ends — even a non-text one (LaTeX,
   * Image, a nested note reference, Database) — because
   * `PageRootBlockComponent`'s blank-area click handler
   * (`page-root-block.ts`) checks whether the page's own last note ends in
   * an empty paragraph and, if not, calls `appendParagraphCommand`. That
   * check is hardcoded to `getLastNoteBlock(store)` (the page's *own* last
   * note) — it has no way to reach a canonical note embedded mid-page
   * inside a `note-ref`, and there's no equivalent blank area to click
   * inside a reference's own tightly-fitted rendering anyway. Without an
   * equivalent guarantee here, a non-text block landing last in a
   * referenced note (which is entirely possible — e.g. `/equation`, a
   * nested `/note`, or any future `/image`) leaves the user with
   * *nothing* to click or type into afterward within that note at all.
   *
   * Rather than duplicate the page-root's click-area/hit-testing approach
   * (which depends on there being physical blank canvas space below
   * content — not something this reference's own compact rendering has),
   * this guarantees the invariant proactively: whenever the canonical's
   * last child isn't already an empty paragraph, one is appended. This
   * mirrors the same "always end on an empty paragraph" invariant a
   * freshly created canonical note already starts with, just re-checked
   * after every change instead of only at creation. Since the canonical is
   * an `EdgelessOnly` note the user never otherwise views directly on the
   * edgeless canvas (unlike the earlier, reverted attempt to do this for
   * ordinary edgeless-visible notes — see this story's Change Log for
   * 2026-07-22 — which visibly grew content the user was actively
   * watching in edgeless), there's no equivalent surprise here.
   *
   * Applies to both the same-doc and cross-doc paths (uses `_getCanonical`,
   * which already resolves either case, and `canonical.store` — the
   * canonical's own originating store — rather than `this.std.store`).
   */
  private _ensureTrailingParagraph() {
    // `_getCanonical()`'s own `ensureDocLoaded(refDoc)` call is
    // fire-and-forget (`if (!doc.ready) doc.load()` — never awaited), so
    // reading `canonical.children` immediately afterward can observe a
    // cross-doc canonical whose real content simply hasn't streamed in
    // from persistence yet (an empty/partial `children` array, not an
    // actually-empty note) — indistinguishable from a genuinely empty
    // note by `lastChild?.text !== undefined` below. That read a
    // still-loading doc as "ends in a non-text block" and added a
    // paragraph the note never needed, which is exactly the "extra empty
    // line(s) appear after a reload" bug this guards against: bail out
    // entirely while the doc isn't ready yet, and let `_subscribeTargetDoc`'s
    // own doc-update subscription re-invoke this once real content has
    // actually arrived and `ready` reflects that.
    const refDoc = this.std.workspace.getDoc(this._targetDocId);
    if (!refDoc?.ready) return;

    const canonical = this._getCanonical();
    if (!canonical) return;

    const lastChild = canonical.children[canonical.children.length - 1];
    // Any block with its own text (paragraph, list, heading-like blocks —
    // checked structurally via `.text`, not by flavour, since anything
    // text-capable already gives a place to click/type/press Enter) is
    // already a fine place to continue — only a block with *no* text at
    // all (LaTeX, Image, Database, a nested note-ref, ...) needs a
    // trailing paragraph added after it. Deliberately not narrowed to
    // "ends in an *empty* paragraph" — a non-empty last paragraph (e.g. a
    // freshly created reusable note's own labeled first line) is already
    // just as good a landing spot, and treating it as "needs one more"
    // caused a real regression: two references sharing the same canonical
    // both independently topping up "one more empty paragraph" after any
    // render, snowballing extra blank lines neither reference asked for.
    if (lastChild?.text !== undefined) return;

    const now = Date.now();
    if (now - this._lastTrailingParagraphAddedAt < 300) return;
    this._lastTrailingParagraphAddedAt = now;

    // Uses `canonical.store` (the canonical's *own* originating store), not
    // `this.std.store` (this component's own, possibly-foreign-doc host
    // store) — for a cross-doc reference those are two different stores
    // entirely, and mutating the wrong one would either silently no-op or
    // corrupt the referencing doc instead of the canonical's real host doc.
    canonical.store.captureSync();
    canonical.store.addBlock('affine:paragraph', {}, canonical.id);
  }

  /**
   * Cross-doc-only. Reported live symptom: pressing Enter, converting a
   * paragraph to a list via a markdown shortcut ("* "), or inserting a
   * block via the slash menu — every command that structurally changes
   * the canonical's own children — correctly writes the data, but native
   * focus is lost: the user has to click back into the reference to keep
   * typing, on every single such command.
   *
   * Root cause, established across several rounds of live debugging (see
   * this story's own Change Log for the full trail — earlier fixes here
   * each looked right and turned out to be incomplete) and finally pinned
   * down precisely using a real, Playwright-driven browser reproduction
   * (not just console diagnostics): a structural change causes TWO
   * independent things to go wrong at once, not one.
   *
   * 1. Rebuilding the DOM for the changed content removes the
   *    currently-*focused* node from the document, which unconditionally
   *    blurs focus to `<body>`, and neither `focusTextModel` nor
   *    `RangeBinding`'s own reactive sync ever call `.focus()` on
   *    anything to bring it back — they only ever touch the abstract
   *    `Selection`/`Range`. An explicit `std.host.focus({ preventScroll:
   *    true })` is required, and has to run *after* a real native `Range`
   *    already exists in the target block (confirmed live: focusing a
   *    contenteditable region with no `Range` already established inside
   *    it makes the browser synthesize its own, usually empty, selection
   *    as a side effect of the focus change).
   * 2. Establishing that real native `Range` requires the target block's
   *    own DOM component to already be connected and registered in this
   *    nested scope's `ViewStore` (`std.view.getBlock(id)`) — which,
   *    confirmed via the Playwright reproduction, is *not* reliably true
   *    on the very next `requestAnimationFrame` after the structural
   *    change; it can take several frames. Attempting the sync before
   *    that (`RangeManager.textSelectionToRange` returns `null` when it
   *    can't resolve the block) isn't a harmless no-op — `syncTextSelectionToRange`
   *    treats a `null` range as "clear everything," so trying too early
   *    actively destroys whatever range might already exist. This method
   *    polls across frames (bounded, so a block that's genuinely never
   *    coming — e.g. concurrent deletion — can't spin forever) until the
   *    target block is actually there before touching anything.
   *
   * A third, structural issue makes tracking "the std to retry against"
   * by *reference* actively wrong, also only found via the Playwright
   * reproduction: the very same structural edit that requires this
   * reclaim can *also* cause `_maybeRefreshPreview` (invoked from
   * `_subscribeTargetDoc`'s ~100ms debounce) to rebuild the nested
   * `Query`/`Store`/`BlockStdScope` entirely, since the edit's own new
   * block id wasn't in the previous snapshot (see that method's own
   * comment on why the query has to be rebuilt at all). That leaves an
   * in-flight poll holding a reference to an already-superseded
   * `_previewStd`, chasing a block that was never going to appear there
   * — it only ever existed in the *replacement* std. This is why
   * `_pendingFocus` (see its own field comment) is tracked at the
   * component level rather than passed around by std reference: each
   * retry re-reads `this._previewStd` fresh, so a mid-poll std swap is
   * simply picked up rather than orphaning the poll, and a brand-new std
   * — which starts with no `TextSelection` of its own to react to at all
   * — gets one explicitly constructed and applied here rather than
   * waiting for a signal that will never fire on its own.
   *
   * Only reclaims when native DOM focus has *actually* left this scope
   * (`!activeInScope`) — checked via `document.activeElement`, not via
   * this std's own `event.active` flag. Those two can genuinely disagree:
   * confirmed live, via the same Playwright reproduction, that clicking a
   * slash-menu item deactivates this nested scope's own dispatcher
   * (`event.active` flips to `false`) *without* moving
   * `document.activeElement` at all — the slash-menu widget's own DOM
   * renders as a portal outside `<affine-note-ref>` entirely, so a click
   * on one of its items bubbles straight past this component's own
   * `_stopDispatcherActivationBubbling` guard (which only intercepts
   * events that bubble *through* this element) and reactivates the
   * *outer* page's dispatcher via `UIEventDispatcher`'s single
   * app-wide-mutual-exclusion `_activeDispatcher`, deactivating this one
   * as a side effect — while the click handler itself (by design, a
   * standard toolbar/menu UX pattern) never actually steals DOM focus
   * away from the editor at all. Gating on `event.active` here treated
   * that entirely legitimate, transient deactivation as "focus was
   * destroyed by a DOM rebuild," and forcibly reapplied a *stale*
   * `_pendingFocus` selection — confirmed live: this raced directly
   * against the slash-menu's own `_handleClickItem` (which first cleans
   * the "/query" text, *then* asynchronously runs `item.action`), landing
   * in the middle of that sequence and corrupting the selection state the
   * action's own command chain (e.g. `getSelectedModelsCommand`) needed,
   * which is why slash-menu items silently inserted nothing. An ordinary
   * keystroke while genuinely focused also fires the selection-changed
   * signal this is triggered from and must be a no-op; re-focusing
   * unconditionally on every keystroke would fight the user's own native
   * caret position (e.g. arrow-key movement) on every single one — but
   * that's already covered by checking real DOM focus, since an ordinary
   * keystroke never moves `document.activeElement` away in the first
   * place.
   */
  private _reclaimFocusAfterSelectionChange(attemptsLeft = 60) {
    if (attemptsLeft === 60) {
      const now = Date.now();
      if (now - this._lastFreshReclaimAttemptAt < 250) return;
      this._lastFreshReclaimAttemptAt = now;
    }
    requestAnimationFrame(() => {
      const std = this._previewStd;
      const pending = this._pendingFocus;
      if (!std || !pending) return;
      // `std` can be a stale reference to an already-superseded
      // `_previewStd` if a rebuild happened between scheduling this poll
      // and it actually running (see this method's own doc comment on the
      // "std swap mid-poll" hazard) — comparing strictly against
      // `std.host` in that case incorrectly concludes focus was "lost"
      // even though the user's own click already landed correctly inside
      // the *replacement* std's own content, stealing it right back out
      // from under them onto the bare host element instead (confirmed
      // live: `document.activeElement` turned out to be the plain
      // `<editor-host>` container itself, not any text position — exactly
      // what calling `.focus()` directly on it, rather than a real caret,
      // produces; symptom was a cursor appearing for a moment after a
      // click, then vanishing with typing going nowhere). Treating
      // "already inside *some* live, connected contenteditable region" as
      // good enough avoids depending on the exact (possibly stale)
      // instance match.
      const activeElement = document.activeElement;
      const activeInScope =
        activeElement?.closest('editor-host') === std.host ||
        (!!activeElement?.isConnected &&
          !!activeElement.closest('[contenteditable="true"]'));
      if (activeInScope) return;

      if (!std.view.getBlock(pending.blockId)) {
        if (attemptsLeft > 0) {
          this._reclaimFocusAfterSelectionChange(attemptsLeft - 1);
        }
        return;
      }

      // Snapshot every scrollable ancestor's `scrollTop` (and the window's
      // own `scrollY`) before touching anything, and restore them one
      // frame later. Root-caused live: `rich-text.ts`'s own `RichText`
      // component has a built-in "keep the caret in view" auto-scroll —
      // whenever its `inlineRange` changes, it measures the new caret's
      // position against a `verticalScrollContainer` and calls
      // `this.scrollIntoView(...)` if the caret appears to be outside its
      // visible bounds. That's legitimate, shared BlockSuite behavior
      // (not specific to note-ref) for the *ordinary* case of a user
      // typing past the edge of their own viewport. It misfires here
      // because `syncTextSelectionToRange` below has to *recreate* the
      // `Range` from scratch (see this method's own doc comment on why),
      // which re-triggers that same reactive check — even though the
      // user's own caret was already visible right where they left it,
      // since nothing about their actual viewport changed, only the
      // abstract Range object identity did. Confirmed live via a stack
      // trace: `Selection.addRange` (called from this method's own
      // `syncTextSelectionToRange`) was directly followed by `rich-
      // text.ts`'s own `scrollIntoView({ block: 'end' })`, which then
      // moved a real scroll container's `scrollTop` by over 100px with no
      // corresponding user action — precisely the "page jumps up while
      // typing" symptom reported live. Restoring the pre-existing scroll
      // position afterward cancels out this incidental side effect
      // without needing to touch the shared `rich-text.ts` component
      // (whose own auto-scroll behavior is correct and desired elsewhere,
      // including for this exact reference's content once the user
      // scrolls it out of view on purpose).
      //
      // Uses `_snapshotScrollIfNeeded`'s own, much-earlier-captured
      // snapshot (see that method's own comment for why the timing here
      // matters directly) rather than taking a fresh one at this point —
      // by the time this line runs, the poll loop above may already have
      // spent dozens of frames waiting for the target block to connect,
      // and a snapshot taken *now* would already reflect whatever
      // native/engine-level scroll drift happened during that wait,
      // confirmed live to make the "restore" below actively lock in a
      // corrupted position instead of fixing anything. Falls back to a
      // fresh snapshot only if none was captured ahead of time (e.g. this
      // reclaim was triggered by something other than a target-doc
      // update).
      this._snapshotScrollIfNeeded();
      const scrollSnapshots = this._scrollSnapshot ?? [];
      this._scrollSnapshot = null;

      // Prevents `rich-text.ts`'s own `scrollIntoView` call from ever
      // executing in the first place, rather than correcting for it
      // afterward (the snapshot/restore below, kept as a defense-in-depth
      // safety net for any *other* scroll disturbance, e.g. the
      // engine-level CSS-scroll-anchoring jump `overflow-anchor: none`
      // in this component's own static styles now separately guards
      // against). Confirmed live that the restore-after-the-fact
      // approach alone still produced a visible "jumps up and then
      // down" — technically ending in the right place, but still two
      // separate jitters the user could see, not the "no jump at all"
      // that's actually wanted. Cleared after a generous window past the
      // confirmed ~100ms async delay before `rich-text.ts`'s own check
      // actually runs.
      suppressingScrollIntoView.add(this);
      setTimeout(() => suppressingScrollIntoView.delete(this), 500);

      std.event.active = true;
      const sel = std.selection.create(TextSelection, {
        from: { blockId: pending.blockId, index: pending.index, length: 0 },
        to: null,
      });
      this._isReclaimingFocus = true;
      try {
        std.selection.setGroup('note', [sel]);
        std.host.range?.syncTextSelectionToRange(sel);
        std.host.focus({ preventScroll: true });
      } finally {
        this._isReclaimingFocus = false;
      }

      // Safety net only, at this point — see the suppression added just
      // above for the primary fix. Re-asserting the snapshot on every
      // frame for a generous window covers anything that still manages
      // to move the scroll position despite that suppression.
      const restoreDeadline = performance.now() + 400;
      const restore = () => {
        scrollSnapshots.forEach(({ el, top }) => {
          if (el instanceof Window) {
            if (el.scrollY !== top) el.scrollTo({ top, behavior: 'instant' });
          } else if ((el as HTMLElement).scrollTop !== top) {
            (el as HTMLElement).scrollTop = top;
          }
        });
        if (performance.now() < restoreDeadline) {
          requestAnimationFrame(restore);
        }
      };
      requestAnimationFrame(restore);
    });
  }

  /**
   * Captures `scrollTop` (and `window.scrollY`) for every scrollable
   * ancestor, but *only* the first time it's called since the last
   * restore — deliberately not overwritten on subsequent calls within the
   * same reclaim cycle. Root-caused live (via a real stack-trace-and-
   * timeline console session with the user): a scroll snapshot taken
   * *later* — e.g. inside `_reclaimFocusAfterSelectionChange`'s own
   * `requestAnimationFrame`-based polling loop, which can legitimately
   * take dozens of frames while it waits for a newly-created block's
   * component to connect — observes state that native browser behavior
   * (a caret/selection-follow auto-scroll, seemingly not implemented via
   * any of `scrollIntoView`/`scrollTo`/`scrollBy`/a plain `.scrollTop =`
   * assignment — none of which fired in the ~945ms gap actually
   * observed, strongly suggesting an engine-internal mechanism with no
   * JS-visible hook at all) has *already* silently corrupted by that
   * point. Restoring to an already-corrupted snapshot doesn't fix
   * anything — confirmed live, it actively *reinforces* the bad position,
   * since the page had partially drifted back toward the correct value
   * on its own by the time the (too-late) snapshot's value got
   * force-reapplied. Capturing here instead — synchronously, in direct
   * reaction to the underlying Yjs `update` event, which fires as part of
   * the exact same synchronous call stack as the keystroke's own command
   * execution, before the browser has had any chance to yield back to
   * the event loop and run its own layout/scroll machinery — is the
   * earliest hook this component has any access to at all.
   */
  private _snapshotScrollIfNeeded() {
    // A previous snapshot that's too old to trust gets discarded here,
    // before the "already have one" guard below — see `_scrollSnapshotTakenAt`'s
    // own field comment for why staleness, not just presence, is what
    // actually matters.
    if (
      this._scrollSnapshot &&
      Date.now() - this._scrollSnapshotTakenAt >
        NoteRefBlockComponent.SCROLL_SNAPSHOT_MAX_AGE_MS
    ) {
      this._scrollSnapshot = null;
    }
    if (this._scrollSnapshot) return;
    const snapshots: { el: Element | Window; top: number }[] = [];
    // Walking the DOM ancestor chain starting from this element itself,
    // not a scope-binding workaround.
    // oxlint-disable-next-line typescript/no-this-alias
    let node: HTMLElement | null = this;
    while (node) {
      if (node.scrollHeight > node.clientHeight) {
        snapshots.push({ el: node, top: node.scrollTop });
      }
      node = node.parentElement;
    }
    snapshots.push({ el: window, top: window.scrollY });
    this._scrollSnapshot = snapshots;
    this._scrollSnapshotTakenAt = Date.now();
  }

  /**
   * There's no dedicated "a different note's children changed" signal to
   * subscribe to directly, so this falls back to the doc's raw Yjs
   * `update` event (fires on any change in the doc, not just this
   * canonical) — debounced. For the same-doc path, `requestUpdate()` just
   * re-runs `render()`, which reads the canonical's current children fresh
   * every time via `renderChildren`. For the cross-doc path, this also
   * re-checks `_maybeRefreshPreview` (structural changes to the ancestor
   * chain need a new `Query`/`Store`).
   */
  private _subscribeTargetDoc() {
    this._targetDocUnsubscribe?.();
    this._targetDocUnsubscribe = null;

    const refDoc = this.std.workspace.getDoc(this._targetDocId);
    if (!refDoc) return;
    ensureDocLoaded(refDoc);

    const onTargetDocUpdate = () => {
      if (this._isCrossDoc) this._snapshotScrollIfNeeded();
      if (this._refreshDebounce) clearTimeout(this._refreshDebounce);
      this._refreshDebounce = setTimeout(() => {
        this._ensureTrailingParagraph();
        if (this._isCrossDoc) {
          const before = this._previewStore;
          this._maybeRefreshPreview();
          if (this._previewStore !== before) this.requestUpdate();
        } else {
          this.requestUpdate();
        }
      }, 100);
    };
    refDoc.spaceDoc.on('update', onTargetDocUpdate);
    this._targetDocUnsubscribe = () => {
      refDoc.spaceDoc.off('update', onTargetDocUpdate);
    };
  }

  // ---------------------------------------------------------------------
  // Cross-doc path (Story 0.5) — nested `BlockStdScope`, mirroring
  // `database-ref-block.ts`'s own proven mechanism.
  // ---------------------------------------------------------------------

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
    // The old `_previewStd` belongs to a store that's about to stop being
    // rendered — clear it so `_stopDispatcherActivationBubbling` doesn't
    // activate a soon-to-be-discarded dispatcher during the brief window
    // before `renderBlock()`'s own `guard()` constructs the replacement.
    this._previewStd = null;
    this._previewSelectionSubscription?.unsubscribe();
    this._previewSelectionSubscription = null;
  }

  private _maybeRefreshPreview() {
    const { refBlockId } = this.model.props;
    if (!refBlockId) {
      this._resolveError = 'This reference is missing its target.';
      this._replacePreviewStore(null, null, null);
      return;
    }
    // `_targetDocId`, not the raw `refDocId` prop directly — an
    // originally same-doc-authored reference has no `refDocId` of its own
    // at all (see that getter's own comment), which is a perfectly valid
    // target once forced onto this, the cross-doc, path (see
    // `_isNestedInAnotherReference`) — it was never actually "missing."
    const refDocId = this._targetDocId;

    const refDoc = this.std.workspace.getDoc(refDocId);
    if (!refDoc) {
      this._resolveError = 'The referenced page could not be found.';
      this._replacePreviewStore(null, null, null);
      return;
    }
    ensureDocLoaded(refDoc);

    // `ensureDocLoaded` only *kicks off* loading (`if (!doc.ready) doc.
    // load()`, never awaited) — a still-loading doc's own target block
    // genuinely isn't resolvable yet, indistinguishable here from "this
    // reference is broken." Reading that as a permanent resolve error
    // would flash "The referenced note could not be found" (or leave a
    // stale/no preview) during the load window instead of just waiting;
    // bailing out entirely here (neither erroring nor clearing any
    // already-good preview) lets `_subscribeTargetDoc`'s own doc-update
    // subscription re-invoke this once the doc actually finishes loading.
    if (!refDoc.ready) return;

    const targetStore = refDoc.getStore({ id: refDoc.id });
    const targetModel = targetStore.getBlock(refBlockId)?.model;
    if (!targetModel || targetModel.flavour !== 'affine:note') {
      this._resolveError = 'The referenced note could not be found.';
      this._replacePreviewStore(null, null, null);
      return;
    }

    if (this._wouldRenderCycle(refDocId, refBlockId)) {
      this._resolveError = 'This reference points back to itself.';
      this._replacePreviewStore(null, null, null);
      return;
    }

    const ancestorChain = this._getAncestorChain(targetStore, targetModel);

    // The query only ever needs rebuilding when the canonical's own
    // *ancestor* chain changes (it moved to a different parent, or got
    // repointed to a different doc entirely) — never for changes to its
    // *descendants*. That's the whole point of the `ancestor` match kind
    // below: unlike enumerating every descendant id into a fixed
    // snapshot (this method's own earlier approach — see this story's
    // Change Log for the real bugs that produced, and why), `{ ancestor:
    // targetModel.id, viewType: 'display' }` is evaluated *fresh*, by
    // `runQuery`, every single time any block gets added anywhere in the
    // underlying doc (`Store._onBlockAdded` already calls `_runQuery` on
    // every new block unconditionally) — so a structural edit inside the
    // note (Enter splitting a paragraph, a markdown-shortcut conversion
    // replacing a block) is classified correctly, automatically, the
    // very first moment its new block exists, with no query rebuild, no
    // new `Store`, and therefore no full nested `BlockStdScope` teardown
    // and rebuild ever required for it at all. That teardown-and-rebuild
    // was traced, across an extended live debugging session, as the true
    // root cause of a whole cascade of symptoms chased individually
    // before this fix (focus loss after Enter, a markdown-shortcut
    // block's text disappearing, an inserted-via-slash-menu block's own
    // popup never appearing, and a visible scroll jump on every
    // structural edit) — each earlier fix in that chain was a real,
    // correct patch for a real symptom of this same underlying cause,
    // not a wrong turn, but treating the cause directly here removes the
    // need for most of that machinery to ever engage in the first place.
    if (
      this._previewStore &&
      !this._resolveError &&
      this._sameChain(ancestorChain, this._ancestorChain)
    ) {
      return;
    }

    this._ancestorChain = ancestorChain;

    const query: Query = {
      mode: 'include',
      match: [
        ...ancestorChain.map(id => ({ id, viewType: 'display' as const })),
        { id: targetModel.id, viewType: 'display' as const },
        { ancestor: targetModel.id, viewType: 'display' as const },
      ],
    };

    const nextPreviewStore = refDoc.getStore({ query });
    // `refDoc.getStore({ query })` only *constructs* the Store — every
    // `StoreExtension`'s own `loaded()` lifecycle hook (attaching its
    // real event listeners, computing its own initial state) doesn't run
    // until `Store.load()` is explicitly called, a *separate* step from
    // `Doc.load()`. Confirmed live as the root cause of a real bug: undo
    // (Mod-z) silently did nothing for edits made inside a cross-doc
    // reference, even though the edits themselves genuinely landed on
    // the real source doc. `HistoryExtension` (`store.ts`'s own
    // `_history` getter) is exactly such an extension — its `_canUndo`/
    // `_canRedo` signals (what `Store.canUndo`/`.canRedo` actually read)
    // stay frozen at their construction-time default (`false`) forever
    // unless `loaded()` runs, regardless of how many real, undo-stack-
    // worthy edits happen afterward, since the event listeners that would
    // update them are *also* only attached inside that same `loaded()`
    // call. `database-ref-block.ts`'s own `_maybeRefreshPreview` had this
    // identical gap — fixed there too, same one-line change.
    nextPreviewStore.load();
    this._replacePreviewStore(nextPreviewStore, refDoc, query);
    this._resolveError = null;
  }

  /**
   * Same hazard, same fix as `database-ref-block.ts`'s identically-named
   * method: `UIEventDispatcher` tracks exactly one app-wide "active"
   * dispatcher in a *static* field; a pointerdown/click/etc. that bubbles
   * past this wrapper reaches the outer host's own identical listener too,
   * reactivating the outer dispatcher and silently deactivating our nested
   * one every time. Stopping these specific events right at this wrapper's
   * boundary (after the nested dispatcher's own listener, bound further
   * down on the nested host, has already run) prevents that — *provided*
   * the nested `BlockStdScope`'s own listeners are already bound by the
   * time the event fires.
   *
   * They aren't always. `_previewStd` (and its whole listener set) is only
   * constructed the moment Lit actually renders the `guard()`-wrapped
   * `BlockStdScope.render()` call in `renderBlock()` — on the very first
   * render after mount, or the render right after `_maybeRefreshPreview`
   * swaps in a new `_previewStore`, there's a real window where this
   * wrapper's own listener (bound eagerly in `connectedCallback`) exists
   * before the nested one does. In that window, stopping propagation here
   * blocks the *outer* dispatcher from reactivating (correct) but nothing
   * activates the *nested* one either (since its own not-yet-bound
   * listener never got the chance to) — leaving neither dispatcher active,
   * which is indistinguishable from "no cursor, nothing responds" until
   * something else (a second click, a reload rebuilding `_previewStd`
   * before the user's next attempt) happens to land after binding
   * completes. Explicitly activating `_previewStd`'s own dispatcher here,
   * directly, removes the dependency on that timing entirely.
   */
  /**
   * 999.11 follow-up: on iOS a still touch tap in this linked note's text is
   * delivered normally but WebKit does not move the caret -- see
   * touch-caret.ts. If the caret has not moved shortly after such a tap,
   * place it at the tap point ourselves (capture phase: inner handlers stop
   * pointerdown from bubbling).
   */
  private _installTouchCaretFallback() {
    let down: { x: number; y: number; id: number; caret: string } | null = null;
    const onDown = (e: PointerEvent) => {
      down =
        e.pointerType === 'touch'
          ? {
              x: e.clientX,
              y: e.clientY,
              id: e.pointerId,
              caret: caretKey(document.getSelection()),
            }
          : null;
    };
    const onUp = (e: PointerEvent) => {
      const start = down;
      down = null;
      if (!start || e.pointerType !== 'touch' || e.pointerId !== start.id)
        return;
      const up = { x: e.clientX, y: e.clientY };
      setTimeout(() => {
        const selection = document.getSelection();
        if (!selection) return;
        if (!shouldPlaceCaretAfterTap(start, up, caretKey(selection))) return;
        const range = document.caretRangeFromPoint?.(start.x, start.y);
        if (!range) return;
        const node = range.startContainer;
        const element = node instanceof Element ? node : node.parentElement;
        const editable = element?.closest<HTMLElement>(
          '[contenteditable="true"]'
        );
        if (!element || !editable || !this.contains(editable)) return;
        selection.removeAllRanges();
        selection.addRange(range);
        // Focus after the range exists (see _reclaimFocusAfterSelectionChange's comment).
        const root = element.closest<HTMLElement>('affine-note') ?? editable;
        if (!root.contains(document.activeElement)) {
          root.focus({ preventScroll: true });
        }
      }, 80);
    };
    this.addEventListener('pointerdown', onDown, true);
    this.addEventListener('pointerup', onUp, true);
    this._disposables.add(() => {
      this.removeEventListener('pointerdown', onDown, true);
      this.removeEventListener('pointerup', onUp, true);
    });
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
    const stop = (e: Event) => {
      e.stopPropagation();
      if (this._previewStd) this._previewStd.event.active = true;
    };
    eventNames.forEach(name => this.addEventListener(name, stop));
    this._disposables.add(() =>
      eventNames.forEach(name => this.removeEventListener(name, stop))
    );
  }

  /**
   * A previous version of this method applied `RANGE_QUERY_EXCLUDE_ATTR`
   * to every descendant *permanently*, on the belief (stated in this
   * method's own earlier comment) that "the nested scope's rendered
   * content is never a target for the outer std's own
   * getSelectedModelsCommand/slash-menu... so a permanent blanket
   * exclusion is safe here." That was wrong, and broke real
   * functionality: confirmed via a real Playwright browser reproduction
   * that clicking a slash-menu item *inside* the reference silently
   * inserted nothing. Root cause: `RangeManager.getSelectedBlockComponentsByRange`
   * (used internally by `getSelectedBlocksCommand`, which every
   * selection-driven command — including every slash-menu item's own
   * insert action — routes through) queries via `this.std.host.
   * querySelectorAll('[data-block-id]:not([${RANGE_QUERY_EXCLUDE_ATTR}=
   * "true"])')`. For the *outer* std that's scoped to the whole page; for
   * the *nested* std it's scoped to just this reference's own content —
   * but it's the exact same DOM elements underneath either way, and the
   * exclusion attribute is a single, shared, boolean DOM attribute with
   * no concept of "which std is asking." A permanent exclusion doesn't
   * just protect the outer std's own sweeps from reaching in — it also
   * permanently blinds the *nested* std's own, entirely legitimate
   * internal queries to its own content, breaking every command that
   * needs to resolve "what block is the current (nested) selection on."
   *
   * Fixed by making this conditional, mirroring the same-doc path's own
   * `_updateRangeQueryExclusion` (which already gets this right for that
   * case) but with the boundary check flipped: exclusion should apply
   * only when the *outer* std's own current selection genuinely spans
   * across this reference's boundary (touches some block id inside this
   * reference *and* some block id outside it in the same selection) — the
   * one case a sweep-based delete could actually reach in and corrupt
   * canonical content. Whenever the outer selection is empty (the normal
   * state while the user is actively working *inside* the reference,
   * since the outer std has no reason to hold a selection then) or
   * entirely outside this reference (ordinary editing elsewhere on the
   * page), there is no cross-boundary risk to guard against, so exclusion
   * is lifted — which is exactly when the nested std's own internal
   * queries need it lifted to function at all.
   */
  private readonly _updateCrossDocRangeQueryExclusion = () => {
    const descendants = Array.from(
      this.querySelectorAll<HTMLElement>('[data-block-id]')
    );
    if (descendants.length === 0) return;

    const descendantIds = new Set(descendants.map(el => el.dataset.blockId));
    const outerBlockIds = new Set<string>();
    for (const sel of this.std.selection.value) {
      outerBlockIds.add(sel.blockId);
      if (sel.is(TextSelection) && sel.to) {
        outerBlockIds.add(sel.to.blockId);
      }
    }
    const touchesInside = Array.from(outerBlockIds).some(id =>
      descendantIds.has(id)
    );
    const touchesOutside = Array.from(outerBlockIds).some(
      id => !descendantIds.has(id)
    );
    const needsExclusion = touchesInside && touchesOutside;

    descendants.forEach(el => {
      if (needsExclusion) {
        el.setAttribute(RANGE_QUERY_EXCLUDE_ATTR, 'true');
      } else {
        el.removeAttribute(RANGE_QUERY_EXCLUDE_ATTR);
      }
    });
  };

  private _observeForCrossDocRangeExclusion() {
    this._rangeExcludeObserver?.disconnect();
    this._updateCrossDocRangeQueryExclusion();
    this._rangeExcludeObserver = new MutationObserver(() => {
      this._updateCrossDocRangeQueryExclusion();
    });
    this._rangeExcludeObserver.observe(this, {
      childList: true,
      subtree: true,
    });
  }

  // ---------------------------------------------------------------------

  override connectedCallback() {
    super.connectedCallback();

    if (this._isCrossDoc) {
      ensureScrollIntoViewSuppressionInstalled();
      this._maybeRefreshPreview();
      this._subscribeTargetDoc();
      this._observeForCrossDocRangeExclusion();
      this._stopDispatcherActivationBubbling();
      this._installTouchCaretFallback();

      this._disposables.add(
        this.std.selection.slots.changed.subscribe(() => {
          this._updateCrossDocRangeQueryExclusion();
        })
      );
    } else {
      this._subscribeTargetDoc();
      this._observeForRangeQueryExclusion();

      this._disposables.add(
        this.std.selection.slots.changed.subscribe(() => {
          this._updateRangeQueryExclusion();
        })
      );

      this._disposables.addFromEvent(this, 'pointerdown', () => {
        this._reclaimViewRegistration();
      });
      this._disposables.addFromEvent(this, 'focusin', () => {
        this._reclaimViewRegistration();
      });
      this._installTouchCaretFallback();
    }

    this._disposables.add(
      this.model.propsUpdated.subscribe(({ key }) => {
        if (key === 'refDocId' || key === 'refBlockId') {
          if (this._isCrossDoc) this._maybeRefreshPreview();
          this._subscribeTargetDoc();
          this.requestUpdate();
        } else if (key === 'showBorder' || key === 'backgroundOverride') {
          this.requestUpdate();
        }
      })
    );

    this._disposables.add(() => {
      this._targetDocUnsubscribe?.();
      if (this._refreshDebounce) clearTimeout(this._refreshDebounce);
      this._rangeExcludeObserver?.disconnect();
      this._replacePreviewStore(null, null, null);
    });
  }

  // `showBorder`/`backgroundOverride` style the *host* element itself
  // (`<affine-note-ref>`, matched by `static styles` above) — not some
  // inner wrapper div. `render()`'s returned template only controls this
  // element's light-DOM *content*; the host's own attributes/inline style
  // have to be set imperatively, here, on `this`.
  override updated() {
    const { showBorder, backgroundOverride } = this.model.props;
    this.dataset.showBorder = showBorder ? 'true' : 'false';
    // `backgroundOverride` is a theme `Color` token (e.g. `{dark, light}`),
    // never a resolved CSS string — resolving it once at creation time
    // would bake in whichever scheme was active then, leaving every
    // note-ref showing the *other* scheme's color after a theme switch.
    // Resolved here, at render/update time, exactly like `note-block.ts`'s
    // own `_pageBackgroundOverride`/`resolveColor` call for the canonical
    // note's own background.
    this.style.backgroundColor = backgroundOverride
      ? resolveColor(backgroundOverride, this.std.get(ThemeProvider).appTheme)
      : '';

    // Re-checked after every re-render, not just from the doc-update
    // subscription above: `renderBlock()`'s `canonical.children` read (for
    // the same-doc path) already makes this a `SignalWatcher`-tracked
    // signal, so BlockSuite's own reactivity *already* re-renders this
    // component the moment a new sibling is added anywhere in the
    // canonical (that's the same mechanism that already made "Enter
    // creates a new line" work, entirely independent of the doc-update
    // subscription). Relying solely on that subscription's own debounce
    // turned out to miss the live "insert a non-text block, live, into an
    // already-mounted reference" case in practice — piggybacking on the
    // reactivity that's already proven reliable here instead, rather than
    // trusting a second, parallel signal for the same fact.
    this._ensureTrailingParagraph();
  }

  override renderBlock() {
    if (this._isCrossDoc) {
      if (this._resolveError) {
        return html`<div class="affine-note-ref-error">
          ${this._resolveError}
        </div>`;
      }
      if (!this._previewStore) return nothing;

      // `contenteditable="false"` here is load-bearing, not decoration.
      // The outer page's own `<affine-page-root>` is unconditionally
      // `contenteditable="true"` (`page-root-block.ts`), and this nested
      // scope's rendered rich-text divs are *also* independently
      // `contenteditable="true"` (each one sets its own, per
      // `rich-text.ts`) — with nothing marking the boundary between them
      // as a break, the browser has no way to tell these are two
      // separate editable regions rather than one continuous one, and
      // (confirmed live, via a real user's own console diagnostics: the
      // native `Selection` correctly resolved inside this nested content,
      // but the actual `beforeinput` event's own target/composedPath
      // resolved to the *outer* page instead) can silently route input
      // events to the outer region while the caret sits in this one —
      // exactly the "types where text already exists, Enter does
      // nothing, nothing persists" symptom this was chasing. Explicitly
      // marking this boundary `false` turns each rich-text div back into
      // its own clearly-isolated editable island, the standard fix for
      // nesting an editable region inside another editable region.
      return html`<div contenteditable="false">
        ${guard([this._previewStore], () => {
          if (!this._previewStore) return nothing;
          this._previewStd = new BlockStdScope({
            store: this._previewStore,
            extensions: this._previewSpec,
          });
          const std = this._previewStd;
          this._previewSelectionSubscription?.unsubscribe();
          this._previewSelectionSubscription =
            std.selection.slots.changed.subscribe(sels => {
              const sel = sels.find((s): s is TextSelection =>
                s.is(TextSelection)
              );
              // An empty selection can be *intentional* — e.g. `latex-
              // block.ts`'s own `toggleEditor()` calls `this.selection.
              // setGroup('note', [])` deliberately, right before opening
              // its own LaTeX-editing popup. Confirmed live: reclaiming
              // unconditionally here (using the now-stale `_pendingFocus`
              // from before the insert) fought that popup's own
              // clear-and-open sequence and stole focus back into the
              // text, breaking the popup entirely. Only reclaim when
              // there's an actual new `TextSelection` to restore — an
              // empty one is a signal to leave well alone, not a sign
              // focus was accidentally destroyed.
              if (!sel) return;
              this._pendingFocus = {
                blockId: sel.from.blockId,
                index: sel.from.index,
              };
              // This selection change is our own reclaim's `setGroup` echo,
              // not a new external selection needing to be reclaimed — see
              // `_isReclaimingFocus`'s own field comment. Recursing here
              // was the actual infinite loop, not just a redundant retry.
              if (this._isReclaimingFocus) return;
              this._reclaimFocusAfterSelectionChange();
            });
          // A brand-new std (e.g. from `_maybeRefreshPreview` rebuilding
          // the query mid-edit — see `_reclaimFocusAfterSelectionChange`'s
          // own comment) starts with no `TextSelection` of its own and so
          // will never fire the subscription above on its own. If the
          // user had an in-progress focus intent from *before* this std
          // was created, try to reapply it here too.
          if (this._pendingFocus) this._reclaimFocusAfterSelectionChange();
          return std.render();
        })}
      </div>`;
    }

    const canonical = this._getCanonical();
    if (!canonical) {
      return html`<div class="affine-note-ref-error">
        The referenced note could not be found.
      </div>`;
    }

    if (
      this._wouldRenderCycle(this._targetDocId, this.model.props.refBlockId)
    ) {
      return html`<div class="affine-note-ref-error">
        This reference points back to itself.
      </div>`;
    }

    return html`${this.std.host.renderChildren(canonical) ?? nothing}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-note-ref': NoteRefBlockComponent;
  }
}
