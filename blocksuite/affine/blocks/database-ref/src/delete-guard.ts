import type {
  DatabaseRefBlockModel,
  DatabaseViewRefBlockModel,
  NoteBlockModel,
} from '@blocksuite/affine-model';
import { NoteDisplayMode } from '@blocksuite/affine-model';
import { ensureDocLoaded } from '@blocksuite/affine-shared/utils';
import { Store } from '@blocksuite/store';

import { forgetLastActiveRef } from './database-ref-block';

let installed = false;

/**
 * Deleting a `database-ref` block (via its own selection toolbar, Backspace
 * on a `BlockSelection`, cut, a text-range delete that swept over it,
 * undo/redo, ...) should — mirroring Frame's `surface-ref` — only ever
 * remove *that one view*. But unlike a `surface-ref`, whose underlying
 * frame keeps living untouched forever regardless of how many references
 * to it exist or get deleted, a promoted database has no independent home
 * of its own once its last reference is gone: it sits in a hidden note
 * purely so it has *somewhere* to live (see `commands.ts`'s
 * `ensurePromoted`), not because that's meaningful storage on its own.
 * So deleting the very last reference needs to finish the job — deleting
 * the canonical table (and its rows, and the now-empty hidden note) too —
 * rather than leaving it stranded forever, invisible and unreachable by
 * any UI, but still silently present in the document.
 *
 * A `database-ref`'s own identity unambiguously names "this one view"
 * regardless of what triggered its deletion, so a single global hook on
 * `Store.prototype.deleteBlock`, scoped to just this flavour, is safe —
 * unlike deleting the *canonical* database directly (e.g. via its own
 * "Delete Database" more-menu action, reachable because this package
 * renders the real, fully-interactive `affine-database` component rather
 * than a read-only snapshot), which has no such unambiguous identity from
 * inside a generic `deleteBlock` call and is instead redirected at the
 * source, per-instance, in `database-ref-block.ts`.
 */
export function installDatabaseRefCascadeDelete() {
  if (installed) return;
  installed = true;

  const original = Store.prototype.deleteBlock;

  Store.prototype.deleteBlock = function (this: Store, model, options): void {
    const targetModel =
      typeof model === 'string' ? this.getBlock(model)?.model : model;

    if (
      !targetModel ||
      (targetModel.flavour !== 'affine:database-ref' &&
        targetModel.flavour !== 'affine:database-view-ref')
    ) {
      original.call(this, model, options);
      return;
    }

    // `database-view-ref` shares the exact same `refBlockId`/`refDocId`
    // pointer shape (see `database-view-ref-model.ts`) — both flavours name
    // "a reference to a canonical table" identically, so the rest of this
    // cascade logic treats them interchangeably.
    const { refBlockId, refDocId } = (
      targetModel as DatabaseRefBlockModel | DatabaseViewRefBlockModel
    ).props;
    // Deletions can be issued through a filtered/queried preview store that
    // can't see references living elsewhere in the doc — resolve siblings
    // through the full, unfiltered store instead. `{ id: this.doc.id }`
    // reuses that doc's one default store rather than minting a fresh one
    // (a plain `getStore()` always generates a new cache key) — this runs on
    // every deletion of any `database-ref`, so an unnecessary new `Store`
    // per call adds up exactly like the churn `database-ref-block.ts` had
    // to fix in its own polling path.
    const fullStore = this.doc.getStore({ id: this.doc.id });

    // The canonical table doesn't necessarily live in *this* doc — a
    // cross-doc reference (this story) points `refDocId` at wherever it
    // actually lives, defaulting to this doc for the same-doc case (0.2).
    // And other references to the same table can themselves be scattered
    // across any number of *other* docs too, not just this one or the
    // canonical's own — so "does any other reference exist" has to check
    // every doc currently loaded in the workspace, not just this one.
    // Mirrors the same brute-force-over-loaded-docs pattern this story
    // already added to `surface-ref`'s own cross-doc resolver, for the
    // same reason: there is no per-block cross-doc index to query instead.
    //
    // `deleteBlock` is a synchronous API, so this can only kick off loading
    // (`ensureDocLoaded`) for any doc that isn't ready yet — it can't block
    // waiting for one to actually finish streaming in. A doc that's
    // genuinely cold (never opened this session) is therefore still
    // invisible to this scan for *this* call: a sibling reference living
    // there won't be found (false-negative `hasOtherRefs`), and if it's the
    // canonical's own doc, cleanup is silently skipped rather than run
    // against incomplete data. Kicking off the load at least means a
    // second delete (or any other operation that touches that doc) will
    // see accurate state once it's had time to arrive.
    const canonicalDocId = refDocId || this.doc.id;
    const canonicalDoc = this.doc.workspace.getDoc(canonicalDocId);
    if (canonicalDoc) ensureDocLoaded(canonicalDoc);

    const hasOtherRefs = Array.from(this.doc.workspace.docs.values()).some(
      otherDoc => {
        if (otherDoc.id !== this.doc.id) ensureDocLoaded(otherDoc);
        const otherStore =
          otherDoc.id === this.doc.id
            ? fullStore
            : otherDoc.getStore({ id: otherDoc.id });
        const matchesRef = (
          b: ReturnType<typeof otherStore.getBlocksByFlavour>[number]
        ) =>
          b.model.id !== targetModel.id &&
          (b.model as DatabaseRefBlockModel | DatabaseViewRefBlockModel).props
            .refBlockId === refBlockId;
        return (
          otherStore
            .getBlocksByFlavour('affine:database-ref')
            .some(matchesRef) ||
          otherStore
            .getBlocksByFlavour('affine:database-view-ref')
            .some(matchesRef)
        );
      }
    );

    original.call(this, model, options);

    if (hasOtherRefs) return;
    if (!canonicalDoc) return;

    const canonicalStore =
      canonicalDoc.id === this.doc.id
        ? fullStore
        : canonicalDoc.getStore({ id: canonicalDoc.id });
    const canonical = canonicalStore.getBlock(refBlockId)?.model;
    if (!canonical) return;

    const hiddenNote = canonicalStore.getParent(canonical);
    original.call(canonicalStore, canonical, undefined);
    forgetLastActiveRef(refBlockId);

    if (
      hiddenNote &&
      hiddenNote.flavour === 'affine:note' &&
      (hiddenNote as NoteBlockModel).props.displayMode ===
        NoteDisplayMode.EdgelessOnly &&
      canonicalStore.getBlock(hiddenNote.id) &&
      hiddenNote.children.length === 0
    ) {
      original.call(canonicalStore, hiddenNote, undefined);
    }
  };
}
